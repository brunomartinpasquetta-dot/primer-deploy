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
    const { temporada_id, parcela_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT g.id, g.concepto, g.monto, g.fecha, g.observacion, g.estado,
                 cg.nombre AS categoria,
                 l.nombre AS parcela,
                 t.nombre AS temporada,
                 fp.nombre AS forma_pago,
                 p.nombre AS proveedor
                 FROM Gastos g
                 JOIN CategoriasGasto cg ON g.categoria_id = cg.id
                 JOIN Temporadas t ON g.temporada_id = t.id
                 LEFT JOIN Parcelas l ON g.parcela_id = l.id
                 LEFT JOIN FormasPago fp ON g.forma_pago_id = fp.id
                 LEFT JOIN Proveedores p ON g.proveedor_id = p.id
                 WHERE 1=1`;
    if (temporada_id) { query += ' AND g.temporada_id = @temporada_id'; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    if (parcela_id)      { query += ' AND g.parcela_id = @parcela_id';           dbReq.input('parcela_id', sql.Int, parseInt(parcela_id)); }
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
  const { temporada_id, parcela_id, categoria_id, concepto, monto,
          fecha, forma_pago_id, proveedor_id, observacion } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Registrar el gasto
    const req1 = new sql.Request(transaction);
    await req1
      .input('temporada_id', sql.Int, temporada_id)
      .input('parcela_id', sql.Int, parcela_id || null)
      .input('categoria_id', sql.Int, categoria_id)
      .input('concepto', sql.NVarChar, concepto)
      .input('monto', sql.Decimal(12,2), monto)
      .input('fecha', sql.Date, fecha || new Date())
      .input('forma_pago_id', sql.Int, forma_pago_id || null)
      .input('proveedor_id', sql.Int, proveedor_id || null)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO Gastos (temporada_id, parcela_id, categoria_id, concepto, monto, fecha, forma_pago_id, proveedor_id, observacion)
              VALUES (@temporada_id, @parcela_id, @categoria_id, @concepto, @monto, @fecha, @forma_pago_id, @proveedor_id, @observacion)`);

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
            .input('usuario_nombre', sql.NVarChar, req.user ? req.user.nombre : null)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id, usuario_nombre)
                    VALUES ('egreso', @concepto, @monto, @forma_pago_id, @temporada_id, @usuario_nombre)`);
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

// Anular gasto (soft-delete + reversión financiera)
router.post('/:id/anular', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const gastoId = parseInt(req.params.id);
    const motivo = req.body.motivo || 'Anulación manual';

    const gastoRes = await new sql.Request(transaction)
      .input('id', sql.Int, gastoId)
      .query(`SELECT g.id, g.estado, g.concepto, g.monto, g.forma_pago_id, g.proveedor_id, g.temporada_id,
              fp.nombre AS forma_pago_nombre
              FROM Gastos g
              LEFT JOIN FormasPago fp ON g.forma_pago_id = fp.id
              WHERE g.id = @id`);

    if (!gastoRes.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Gasto no encontrado' }); }
    if (gastoRes.recordset[0].estado === 'anulada') { await transaction.rollback(); return res.status(400).json({ error: 'El gasto ya está anulado' }); }

    const gasto = gastoRes.recordset[0];

    // Revertir movimiento financiero con compensación (INSERT inverso, nunca DELETE)
    if (gasto.forma_pago_id) {
      const esCuentaCorriente = gasto.forma_pago_nombre &&
        gasto.forma_pago_nombre.toLowerCase().includes('cuenta corriente');

      if (esCuentaCorriente && gasto.proveedor_id) {
        await new sql.Request(transaction)
          .input('proveedor_id', sql.Int, gasto.proveedor_id)
          .input('monto', sql.Decimal(12,2), gasto.monto)
          .input('observacion', sql.NVarChar, 'Anulación gasto: ' + gasto.concepto + ' — ' + motivo)
          .query(`INSERT INTO CuentaCorrienteProveedores
                  (proveedor_id, tipo, monto, observacion)
                  VALUES (@proveedor_id, 'credito', @monto, @observacion)`);
      } else if (!esCuentaCorriente) {
        await new sql.Request(transaction)
          .input('concepto', sql.NVarChar, 'Anulación gasto: ' + gasto.concepto + ' — ' + motivo)
          .input('monto', sql.Decimal(12,2), gasto.monto)
          .input('temporada_id', sql.Int, gasto.temporada_id || null)
          .input('usuario_nombre', sql.NVarChar, req.user ? req.user.nombre : null)
          .query(`INSERT INTO Caja (tipo, concepto, monto, temporada_id, usuario_nombre)
                  VALUES ('ingreso', @concepto, @monto, @temporada_id, @usuario_nombre)`);
      }
    }

    // Marcar como anulada
    await new sql.Request(transaction)
      .input('id', sql.Int, gastoId)
      .query("UPDATE Gastos SET estado = 'anulada' WHERE id = @id");

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;