const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET /api/compras — listado con filtros opcionales
router.get('/', async (req, res) => {
  const { temporada_id, desde, hasta } = req.query;
  try {
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT c.id, c.fecha, c.total, c.observacion,
              p.nombre AS proveedor,
              t.nombre AS temporada,
              fp.nombre AS forma_pago,
              u.nombre AS usuario
              FROM Compras c
              JOIN Proveedores p ON c.proveedor_id = p.id
              LEFT JOIN Temporadas t ON c.temporada_id = t.id
              LEFT JOIN FormasPago fp ON c.forma_pago_id = fp.id
              LEFT JOIN Usuarios u ON c.usuario_id = u.id
              WHERE 1=1`;
    if (temporada_id) { query += ' AND c.temporada_id = @temporada_id'; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    if (desde)        { query += ' AND c.fecha >= @desde';              dbReq.input('desde', sql.Date, desde); }
    if (hasta)        { query += ' AND c.fecha <= @hasta';              dbReq.input('hasta', sql.Date, hasta); }
    query += ' ORDER BY c.fecha_hora DESC';
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compras/:id/detalle — ítems de una compra con unidad, envase y vencimiento
router.get('/:id/detalle', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT cd.cantidad, cd.precio_unit, cd.subtotal, cd.fecha_vencimiento,
              pr.nombre AS producto,
              ISNULL(pr.unidad_medida, pr.presentacion) AS unidad,
              pr.envase, pr.tipo
              FROM ComprasDetalle cd
              JOIN Productos pr ON cd.producto_id = pr.id
              WHERE cd.compra_id = @id`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compras — registrar compra completa
router.post('/', async (req, res) => {
  const { proveedor_id, temporada_id, fecha, observacion, forma_pago_id, deposito_id, items } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'La compra debe tener al menos un item' });
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Obtener nombre del proveedor
    const provRes = await new sql.Request(transaction)
      .input('proveedor_id', sql.Int, proveedor_id)
      .query('SELECT nombre FROM Proveedores WHERE id = @proveedor_id');
    const proveedorNombre = provRes.recordset.length > 0 ? provRes.recordset[0].nombre : 'Proveedor';

    const total = items.reduce((acc, item) =>
      acc + (parseFloat(item.cantidad) * parseFloat(item.precio_unit)), 0);

    const uid = req.user ? req.user.id : null;
    const compraResult = await new sql.Request(transaction)
      .input('proveedor_id',  sql.Int,           proveedor_id)
      .input('temporada_id',  sql.Int,           temporada_id || null)
      .input('fecha',         sql.Date,          fecha || new Date())
      .input('total',         sql.Decimal(12,2), total)
      .input('forma_pago_id', sql.Int,           forma_pago_id || null)
      .input('observacion',   sql.NVarChar,      observacion || '')
      .input('usuario_id',    sql.Int,           uid)
      .query(`INSERT INTO Compras (proveedor_id, temporada_id, fecha, total, forma_pago_id, observacion, usuario_id)
              OUTPUT INSERTED.id
              VALUES (@proveedor_id, @temporada_id, @fecha, @total, @forma_pago_id, @observacion, @usuario_id)`);

    const compra_id = compraResult.recordset[0].id;

    for (const item of items) {
      const subtotal     = parseFloat(item.cantidad) * parseFloat(item.precio_unit);
      const fechaVenc    = item.fecha_vencimiento || null;

      // 1. Detalle de compra (con vencimiento)
      await new sql.Request(transaction)
        .input('compra_id',        sql.Int,           compra_id)
        .input('producto_id',      sql.Int,           item.producto_id)
        .input('cantidad',         sql.Decimal(10,3), item.cantidad)
        .input('precio_unit',      sql.Decimal(10,3), item.precio_unit)
        .input('subtotal',         sql.Decimal(12,2), subtotal)
        .input('fecha_vencimiento',sql.Date,          fechaVenc)
        .query(`INSERT INTO ComprasDetalle (compra_id, producto_id, cantidad, precio_unit, subtotal, fecha_vencimiento)
                VALUES (@compra_id, @producto_id, @cantidad, @precio_unit, @subtotal, @fecha_vencimiento)`);

      // 2. Actualizar stock_actual en Productos (siempre)
      await new sql.Request(transaction)
        .input('producto_id', sql.Int,           item.producto_id)
        .input('cantidad',    sql.Decimal(10,3), item.cantidad)
        .input('precio_unit', sql.Decimal(10,3), item.precio_unit)
        .query(`UPDATE Productos
                SET stock_actual = ISNULL(stock_actual, 0) + @cantidad,
                    costo_unitario = @precio_unit
                WHERE id = @producto_id`);

      // 3. Movimiento en StockInsumos (siempre — deposito_id puede ser NULL)
      await new sql.Request(transaction)
        .input('producto_id',      sql.Int,           item.producto_id)
        .input('cantidad',         sql.Decimal(10,3), item.cantidad)
        .input('costo_total',      sql.Decimal(10,2), subtotal)
        .input('proveedor',        sql.NVarChar,      proveedorNombre)
        .input('usuario_id',       sql.Int,           uid)
        .input('deposito_id',      sql.Int,           deposito_id || null)
        .input('compra_id',        sql.Int,           compra_id)
        .input('fecha_vencimiento',sql.Date,          fechaVenc)
        .query(`INSERT INTO StockInsumos
                  (producto_id, tipo, cantidad, costo_total, proveedor, usuario_id, deposito_id, compra_id, fecha_vencimiento, fecha_hora)
                VALUES
                  (@producto_id, 'compra', @cantidad, @costo_total, @proveedor, @usuario_id, @deposito_id, @compra_id, @fecha_vencimiento, GETDATE())`);
    }

    // 4. Movimiento financiero según forma de pago
    if (forma_pago_id) {
      const fpCheck = await new sql.Request(transaction)
        .input('id', sql.Int, forma_pago_id)
        .query('SELECT nombre, es_cuenta_corriente FROM FormasPago WHERE id = @id');

      if (fpCheck.recordset.length > 0) {
        const fpNombre = fpCheck.recordset[0].nombre.toLowerCase();
        const esCuentaCorriente = !!(fpCheck.recordset[0].es_cuenta_corriente);
        const esCheque = fpNombre.includes('cheque');

        if (esCuentaCorriente && proveedor_id) {
          await new sql.Request(transaction)
            .input('proveedor_id',  sql.Int,           proveedor_id)
            .input('monto',         sql.Decimal(12,2), total)
            .input('forma_pago_id', sql.Int,           forma_pago_id)
            .input('compra_id',     sql.Int,           compra_id)
            .input('observacion',   sql.NVarChar,      observacion || 'Compra registrada')
            .query(`INSERT INTO CuentaCorrienteProveedores
                    (proveedor_id, tipo, monto, forma_pago_id, compra_id, observacion)
                    VALUES (@proveedor_id, 'debito', @monto, @forma_pago_id, @compra_id, @observacion)`);

        } else if (esCheque) {
          const chequeResult = await new sql.Request(transaction)
            .input('proveedor_id',  sql.Int,           proveedor_id || null)
            .input('monto',         sql.Decimal(12,2), total)
            .input('fecha_emision', sql.Date,          fecha ? new Date(fecha) : new Date())
            .input('estado',        sql.NVarChar,      'pendiente')
            .input('observacion',   sql.NVarChar,      'Compra #' + compra_id + (observacion ? ' - ' + observacion : ''))
            .query(`INSERT INTO Cheques (proveedor_id, monto, fecha_emision, estado, observacion)
                    OUTPUT INSERTED.id
                    VALUES (@proveedor_id, @monto, @fecha_emision, @estado, @observacion)`);
          const cheque_id = chequeResult.recordset[0].id;

          await new sql.Request(transaction)
            .input('concepto',      sql.NVarChar,      'Compra: ' + proveedorNombre + ' (cheque)' + (observacion ? ' - ' + observacion : ''))
            .input('monto',         sql.Decimal(12,2), total)
            .input('forma_pago_id', sql.Int,           forma_pago_id)
            .input('cheque_id',     sql.Int,           cheque_id)
            .input('temporada_id',  sql.Int,           temporada_id || null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, cheque_id, temporada_id)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @cheque_id, @temporada_id)`);

        } else {
          await new sql.Request(transaction)
            .input('concepto',      sql.NVarChar,      'Compra: ' + proveedorNombre + (observacion ? ' - ' + observacion : ''))
            .input('monto',         sql.Decimal(12,2), total)
            .input('forma_pago_id', sql.Int,           forma_pago_id)
            .input('temporada_id',  sql.Int,           temporada_id || null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @temporada_id)`);
        }
      }
    }

    await transaction.commit();
    res.json({ ok: true, compra_id });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — editar observación
router.patch('/:id', async (req, res) => {
  const { observacion } = req.body;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id',          sql.Int,      req.params.id)
      .input('observacion', sql.NVarChar, observacion || '')
      .query('UPDATE Compras SET observacion = @observacion WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
