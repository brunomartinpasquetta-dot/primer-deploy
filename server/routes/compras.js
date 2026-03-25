const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  const { temporada_id, desde, hasta } = req.query;
  try {
    const pool = await getPool();
    const colCheck = await pool.request().query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Compras' AND COLUMN_NAME='fecha_hora'`
    );
    const orderBy = colCheck.recordset.length > 0 ? 'c.fecha_hora' : 'c.fecha';
    const dbReq = pool.request();
    let query = `SELECT c.id, c.fecha, c.total, c.observacion,
              p.nombre AS proveedor,
              t.nombre AS temporada,
              fp.nombre AS forma_pago
              FROM Compras c
              JOIN Proveedores p ON c.proveedor_id = p.id
              LEFT JOIN Temporadas t ON c.temporada_id = t.id
              LEFT JOIN FormasPago fp ON c.forma_pago_id = fp.id
              WHERE 1=1`;
    if (temporada_id) {
      query += ' AND c.temporada_id = @temporada_id';
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    if (desde) {
      query += ' AND c.fecha >= @desde';
      dbReq.input('desde', sql.Date, desde);
    }
    if (hasta) {
      query += ' AND c.fecha <= @hasta';
      dbReq.input('hasta', sql.Date, hasta);
    }
    query += ` ORDER BY ${orderBy} DESC`;
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/detalle', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT cd.cantidad, cd.precio_unit, cd.subtotal,
              pr.nombre AS producto, pr.presentacion
              FROM ComprasDetalle cd
              JOIN Productos pr ON cd.producto_id = pr.id
              WHERE cd.compra_id = @id`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { proveedor_id, temporada_id, fecha, observacion, forma_pago_id, items } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'La compra debe tener al menos un item' });
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    const total = items.reduce(function(acc, item) {
      return acc + (parseFloat(item.cantidad) * parseFloat(item.precio_unit));
    }, 0);

    const compraResult = await request
      .input('proveedor_id', sql.Int, proveedor_id)
      .input('temporada_id', sql.Int, temporada_id || null)
      .input('fecha', sql.Date, fecha || new Date())
      .input('total', sql.Decimal(12,2), total)
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .input('observacion', sql.NVarChar, observacion || '')
      .query('INSERT INTO Compras (proveedor_id, temporada_id, fecha, total, forma_pago_id, observacion) OUTPUT INSERTED.id VALUES (@proveedor_id, @temporada_id, @fecha, @total, @forma_pago_id, @observacion)');

    const compra_id = compraResult.recordset[0].id;

    for (const item of items) {
      const subtotal = parseFloat(item.cantidad) * parseFloat(item.precio_unit);
      const req2 = new sql.Request(transaction);
      await req2
        .input('compra_id', sql.Int, compra_id)
        .input('producto_id', sql.Int, item.producto_id)
        .input('cantidad', sql.Decimal(10,2), item.cantidad)
        .input('precio_unit', sql.Decimal(10,2), item.precio_unit)
        .input('subtotal', sql.Decimal(12,2), subtotal)
        .query('INSERT INTO ComprasDetalle (compra_id, producto_id, cantidad, precio_unit, subtotal) VALUES (@compra_id, @producto_id, @cantidad, @precio_unit, @subtotal)');

      const req3 = new sql.Request(transaction);
      await req3
        .input('producto_id', sql.Int, item.producto_id)
        .input('cantidad', sql.Decimal(10,2), item.cantidad)
        .input('precio_unit', sql.Decimal(10,2), item.precio_unit)
        .query('UPDATE Productos SET stock_actual = ISNULL(stock_actual, 0) + @cantidad, costo_unitario = @precio_unit WHERE id = @producto_id');
    }

    if (forma_pago_id) {
      const req4 = new sql.Request(transaction);
      const fpCheck = await req4
        .input('id', sql.Int, forma_pago_id)
        .query('SELECT nombre FROM FormasPago WHERE id = @id');

      if (fpCheck.recordset.length > 0) {
        const esCuentaCorriente = fpCheck.recordset[0].nombre.toLowerCase().includes('cuenta corriente');

        const esCheque = fpCheck.recordset[0].nombre.toLowerCase().includes('cheque');

        if (esCuentaCorriente && proveedor_id) {
          // Cuenta corriente: generar debito en cuenta del proveedor
          const req5 = new sql.Request(transaction);
          await req5
            .input('proveedor_id', sql.Int, proveedor_id)
            .input('monto', sql.Decimal(12,2), total)
            .input('forma_pago_id', sql.Int, forma_pago_id)
            .input('compra_id', sql.Int, compra_id)
            .input('observacion', sql.NVarChar, observacion || 'Compra registrada')
            .query(`INSERT INTO CuentaCorrienteProveedores
                    (proveedor_id, tipo, monto, forma_pago_id, compra_id, observacion)
                    VALUES (@proveedor_id, 'debito', @monto, @forma_pago_id, @compra_id, @observacion)`);
        } else if (esCheque) {
          // Cheque: registrar en Cheques + egreso diferido en Caja con referencia
          const chequeReq = new sql.Request(transaction);
          const chequeResult = await chequeReq
            .input('proveedor_id',       sql.Int,           proveedor_id || null)
            .input('monto',              sql.Decimal(12,2), total)
            .input('fecha_emision',      sql.Date,          fecha ? new Date(fecha) : new Date())
            .input('estado',             sql.NVarChar,      'pendiente')
            .input('observacion',        sql.NVarChar,      'Compra #' + compra_id + (observacion ? ' - ' + observacion : ''))
            .query(`INSERT INTO Cheques (proveedor_id, monto, fecha_emision, estado, observacion)
                    OUTPUT INSERTED.id
                    VALUES (@proveedor_id, @monto, @fecha_emision, @estado, @observacion)`);
          const cheque_id = chequeResult.recordset[0].id;

          const cajaReq = new sql.Request(transaction);
          await cajaReq
            .input('concepto',     sql.NVarChar,      'Compra a proveedor (cheque)' + (observacion ? ' - ' + observacion : ''))
            .input('monto',        sql.Decimal(12,2), total)
            .input('forma_pago_id',sql.Int,           forma_pago_id)
            .input('cheque_id',    sql.Int,           cheque_id)
            .input('temporada_id', sql.Int,           temporada_id || null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, cheque_id, temporada_id)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @cheque_id, @temporada_id)`);
        } else {
          // Efectivo, transferencia: generar egreso en Caja
          const req6 = new sql.Request(transaction);
          await req6
            .input('concepto', sql.NVarChar, 'Compra a proveedor' + (observacion ? ' - ' + observacion : ''))
            .input('monto', sql.Decimal(12,2), total)
            .input('forma_pago_id', sql.Int, forma_pago_id)
            .input('temporada_id', sql.Int, temporada_id || null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @temporada_id)`);
        }
      }
    }

    await transaction.commit();
    res.json({ ok: true, compra_id: compra_id });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;