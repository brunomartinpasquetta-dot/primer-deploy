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
              c.proveedor_id, c.numero_remito, c.forma_pago_id, c.temporada_id,
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
  const { proveedor_id, temporada_id, fecha, observacion, forma_pago_id, deposito_id, items, numero_remito } = req.body;
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
      .input('numero_remito', sql.NVarChar,     numero_remito || null)
      .input('usuario_id',    sql.Int,           uid)
      .query(`INSERT INTO Compras (proveedor_id, temporada_id, fecha, total, forma_pago_id, observacion, numero_remito, usuario_id)
              OUTPUT INSERTED.id
              VALUES (@proveedor_id, @temporada_id, @fecha, @total, @forma_pago_id, @observacion, @numero_remito, @usuario_id)`);

    const compra_id = compraResult.recordset[0].id;

    // Obtener contenido_litros de todos los productos de la compra de una vez
    const prodIds = items.map(i => parseInt(i.producto_id)).join(',');
    const prodData = await new sql.Request(transaction)
      .query(`SELECT id, ISNULL(contenido_litros, 1) AS contenido_litros FROM Productos WHERE id IN (${prodIds})`);
    const prodMap = {};
    prodData.recordset.forEach(p => { prodMap[p.id] = parseFloat(p.contenido_litros) || 1; });

    for (const item of items) {
      const unidades     = parseFloat(item.cantidad);       // envases comprados
      const contenido    = prodMap[item.producto_id] || 1;  // lt/kg/u por envase
      const stockQty     = unidades * contenido;            // cantidad real que ingresa a stock
      const subtotal     = unidades * parseFloat(item.precio_unit);
      const fechaVenc    = item.fecha_vencimiento || null;

      // 1. Detalle de compra: cantidad = unidades compradas (para facturación)
      await new sql.Request(transaction)
        .input('compra_id',        sql.Int,           compra_id)
        .input('producto_id',      sql.Int,           item.producto_id)
        .input('cantidad',         sql.Decimal(10,3), unidades)
        .input('precio_unit',      sql.Decimal(10,3), item.precio_unit)
        .input('subtotal',         sql.Decimal(12,2), subtotal)
        .input('fecha_vencimiento',sql.Date,          fechaVenc)
        .query(`INSERT INTO ComprasDetalle (compra_id, producto_id, cantidad, precio_unit, subtotal, fecha_vencimiento)
                VALUES (@compra_id, @producto_id, @cantidad, @precio_unit, @subtotal, @fecha_vencimiento)`);

      // 2. Actualizar stock_actual = stock + (unidades × contenido_por_envase)
      await new sql.Request(transaction)
        .input('producto_id', sql.Int,           item.producto_id)
        .input('stock_qty',   sql.Decimal(10,3), stockQty)
        .input('precio_unit', sql.Decimal(10,3), item.precio_unit)
        .query(`UPDATE Productos
                SET stock_actual = ISNULL(stock_actual, 0) + @stock_qty,
                    costo_unitario = @precio_unit
                WHERE id = @producto_id`);

      // 3. Movimiento en StockInsumos: cantidad = stock real ingresado
      await new sql.Request(transaction)
        .input('producto_id',      sql.Int,           item.producto_id)
        .input('cantidad',         sql.Decimal(10,3), stockQty)
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
            .input('concepto',        sql.NVarChar,      'Compra: ' + proveedorNombre + ' (cheque)' + (observacion ? ' - ' + observacion : ''))
            .input('monto',           sql.Decimal(12,2), total)
            .input('forma_pago_id',   sql.Int,           forma_pago_id)
            .input('cheque_id',       sql.Int,           cheque_id)
            .input('temporada_id',    sql.Int,           temporada_id || null)
            .input('usuario_nombre',  sql.NVarChar,      req.user ? req.user.nombre : null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, cheque_id, temporada_id, usuario_nombre)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @cheque_id, @temporada_id, @usuario_nombre)`);

        } else {
          await new sql.Request(transaction)
            .input('concepto',        sql.NVarChar,      'Compra: ' + proveedorNombre + (observacion ? ' - ' + observacion : ''))
            .input('monto',           sql.Decimal(12,2), total)
            .input('forma_pago_id',   sql.Int,           forma_pago_id)
            .input('temporada_id',    sql.Int,           temporada_id || null)
            .input('usuario_nombre',  sql.NVarChar,      req.user ? req.user.nombre : null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id, usuario_nombre)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @temporada_id, @usuario_nombre)`);
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
  const { observacion, numero_remito, fecha, forma_pago_id, proveedor_id, temporada_id } = req.body;
  try {
    const pool = await getPool();
    const r = pool.request().input('id', sql.Int, req.params.id);
    const sets = [];
    if (observacion !== undefined)   { sets.push('observacion = @obs');      r.input('obs',  sql.NVarChar,  observacion || ''); }
    if (numero_remito !== undefined) { sets.push('numero_remito = @rem');    r.input('rem',  sql.NVarChar,  numero_remito || null); }
    if (fecha !== undefined)         { sets.push('fecha = @fecha');          r.input('fecha', sql.Date,     fecha); }
    if (forma_pago_id !== undefined) { sets.push('forma_pago_id = @fpid');  r.input('fpid', sql.Int,       forma_pago_id || null); }
    if (proveedor_id !== undefined)  { sets.push('proveedor_id = @pid');    r.input('pid',  sql.Int,       proveedor_id); }
    if (temporada_id !== undefined)  { sets.push('temporada_id = @tid');    r.input('tid',  sql.Int,       temporada_id || null); }
    if (!sets.length) return res.json({ ok: true });
    await r.query('UPDATE Compras SET ' + sets.join(', ') + ' WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
