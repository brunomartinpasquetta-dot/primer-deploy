const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Obtener categorias
router.get('/categorias', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre FROM CategoriasGasto WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener gastos
router.get('/', async (req, res) => {
  try {
    const { temporada_id, lote_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT g.id, g.concepto, g.monto, g.fecha, g.observacion,
                 cg.nombre AS categoria,
                 l.nombre AS lote,
                 t.nombre AS temporada,
                 fp.nombre AS forma_pago,
                 p.nombre AS proveedor
                 FROM Gastos g
                 JOIN CategoriasGasto cg ON g.categoria_id = cg.id
                 JOIN Temporadas t ON g.temporada_id = t.id
                 LEFT JOIN Lotes l ON g.lote_id = l.id
                 LEFT JOIN FormasPago fp ON g.forma_pago_id = fp.id
                 LEFT JOIN Proveedores p ON g.proveedor_id = p.id
                 WHERE 1=1`;
    if (temporada_id) { query += ' AND g.temporada_id = @temporada_id'; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    if (lote_id)      { query += ' AND g.lote_id = @lote_id';           dbReq.input('lote_id', sql.Int, parseInt(lote_id)); }
    if (desde)        { query += ' AND g.fecha >= @desde';              dbReq.input('desde', sql.Date, desde); }
    if (hasta)        { query += ' AND g.fecha <= @hasta';              dbReq.input('hasta', sql.Date, hasta); }
    query += ' ORDER BY g.fecha DESC';
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar gasto
router.post('/', async (req, res) => {
  const { temporada_id, lote_id, categoria_id, concepto, monto,
          fecha, forma_pago_id, proveedor_id, observacion } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Registrar el gasto
    const req1 = new sql.Request(transaction);
    await req1
      .input('temporada_id', sql.Int, temporada_id)
      .input('lote_id', sql.Int, lote_id || null)
      .input('categoria_id', sql.Int, categoria_id)
      .input('concepto', sql.NVarChar, concepto)
      .input('monto', sql.Decimal(12,2), monto)
      .input('fecha', sql.Date, fecha || new Date())
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .input('proveedor_id', sql.Int, proveedor_id || null)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO Gastos (temporada_id, lote_id, categoria_id, concepto, monto, fecha, forma_pago_id, proveedor_id, observacion)
              VALUES (@temporada_id, @lote_id, @categoria_id, @concepto, @monto, @fecha, @forma_pago_id, @proveedor_id, @observacion)`);

    if (forma_pago_id) {
      const req2 = new sql.Request(transaction);
      const fpCheck = await req2
        .input('id', sql.Int, forma_pago_id)
        .query('SELECT nombre FROM FormasPago WHERE id = @id');

      if (fpCheck.recordset.length > 0) {
        const esCuentaCorriente = fpCheck.recordset[0].nombre.toLowerCase().includes('cuenta corriente');

        if (esCuentaCorriente && proveedor_id) {
          // Cuenta corriente: generar debito en cuenta del proveedor
          const req3 = new sql.Request(transaction);
          await req3
            .input('proveedor_id', sql.Int, proveedor_id)
            .input('monto', sql.Decimal(12,2), monto)
            .input('forma_pago_id', sql.Int, forma_pago_id)
            .input('observacion', sql.NVarChar, concepto)
            .query(`INSERT INTO CuentaCorrienteProveedores
                    (proveedor_id, tipo, monto, forma_pago_id, observacion)
                    VALUES (@proveedor_id, 'debito', @monto, @forma_pago_id, @observacion)`);
        } else if (!esCuentaCorriente) {
          // Efectivo, transferencia, cheque: generar egreso en Caja
          const req4 = new sql.Request(transaction);
          await req4
            .input('concepto', sql.NVarChar, concepto + (observacion ? ' - ' + observacion : ''))
            .input('monto', sql.Decimal(12,2), monto)
            .input('forma_pago_id', sql.Int, forma_pago_id)
            .input('temporada_id', sql.Int, temporada_id || null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @temporada_id)`);
        }
      }
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Eliminar gasto
router.delete('/:id', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Obtener datos del gasto antes de borrarlo
    const r1 = new sql.Request(transaction);
    const gastoRes = await r1
      .input('id', sql.Int, req.params.id)
      .query(`SELECT g.concepto, g.monto, g.forma_pago_id, g.proveedor_id,
              fp.nombre AS forma_pago_nombre
              FROM Gastos g
              LEFT JOIN FormasPago fp ON g.forma_pago_id = fp.id
              WHERE g.id = @id`);

    if (gastoRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const gasto = gastoRes.recordset[0];

    if (gasto.forma_pago_id) {
      const esCuentaCorriente = gasto.forma_pago_nombre &&
        gasto.forma_pago_nombre.toLowerCase().includes('cuenta corriente');

      if (esCuentaCorriente && gasto.proveedor_id) {
        // Revertir el débito en CuentaCorrienteProveedores
        const r2 = new sql.Request(transaction);
        await r2
          .input('proveedor_id', sql.Int, gasto.proveedor_id)
          .input('monto', sql.Decimal(12,2), gasto.monto)
          .input('observacion', sql.NVarChar, gasto.concepto)
          .query(`DELETE TOP(1) FROM CuentaCorrienteProveedores
                  WHERE proveedor_id = @proveedor_id
                    AND tipo = 'debito'
                    AND monto = @monto
                    AND observacion = @observacion`);
      } else if (!esCuentaCorriente) {
        // Revertir el egreso en Caja
        const r3 = new sql.Request(transaction);
        await r3
          .input('concepto', sql.NVarChar, gasto.concepto)
          .input('monto', sql.Decimal(12,2), gasto.monto)
          .query(`DELETE TOP(1) FROM Caja
                  WHERE tipo = 'egreso'
                    AND monto = @monto
                    AND (concepto = @concepto OR concepto LIKE @concepto + '%')`);
      }
    }

    // Borrar el gasto
    const r4 = new sql.Request(transaction);
    await r4
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Gastos WHERE id = @id');

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;