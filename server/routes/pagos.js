const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/resumen', async (req, res) => {
  try {
    const { temporada_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT j.id, j.apellido + ', ' + j.nombre AS juntador, j.tipo,
                 ISNULL(SUM(jt.kilos), 0) AS total_kilos,
                 ISNULL(SUM(p.total_bruto), 0) AS total_bruto,
                 ISNULL(SUM(CASE WHEN p.tipo = 'anticipo' THEN p.monto ELSE 0 END), 0) AS anticipos,
                 ISNULL(SUM(CASE WHEN p.tipo = 'liquidacion' THEN p.monto ELSE 0 END), 0) AS liquidado,
                 ISNULL(SUM(jt.kilos), 0) * ISNULL(MAX(ph.precio_kilo), 0) -
                 ISNULL(SUM(CASE WHEN p.tipo = 'liquidacion' THEN p.monto ELSE 0 END), 0) -
                 ISNULL(SUM(CASE WHEN p.tipo = 'anticipo' THEN p.monto ELSE 0 END), 0) AS saldo_pendiente
                 FROM Juntadores j
                 LEFT JOIN Juntada jt ON j.id = jt.juntador_id`;
    if (desde && hasta) {
      query += ` AND jt.fecha_hora BETWEEN @desde AND @hasta`;
      dbReq.input('desde', sql.DateTime, desde);
      dbReq.input('hasta', sql.DateTime, hasta + 'T23:59:59');
    }
    query += ` LEFT JOIN Pagos p ON j.id = p.juntador_id`;
    if (temporada_id) {
      query += ` LEFT JOIN PrecioHistorico ph ON ph.temporada_id = @temporada_id AND ph.fecha_hasta IS NULL`;
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    query += ` WHERE j.activo = 1 GROUP BY j.id, j.apellido, j.nombre, j.tipo ORDER BY j.apellido`;
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/juntador/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT id, tipo, monto, fecha, periodo_desde, periodo_hasta,
              kilos_liquidados, precio_kilo, anticipos, total_bruto, saldo_final, observacion
              FROM Pagos WHERE juntador_id = @id ORDER BY fecha DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/anticipo', async (req, res) => {
  const { juntador_id, monto, observacion } = req.body;
  if (!juntador_id || !monto) {
    return res.status(400).json({ error: 'Juntador y monto son obligatorios' });
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const req1 = new sql.Request(transaction);
    await req1
      .input('juntador_id', sql.Int, juntador_id)
      .input('monto', sql.Decimal(10,2), monto)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO Pagos (juntador_id, monto, tipo, observacion)
              VALUES (@juntador_id, @monto, 'anticipo', @observacion)`);

    const req2 = new sql.Request(transaction);
    await req2
      .input('concepto', sql.NVarChar, 'Anticipo a trabajador')
      .input('monto', sql.Decimal(10,2), monto)
      .input('usuario_nombre', sql.NVarChar, req.user ? req.user.nombre : null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, usuario_nombre) VALUES ('egreso', @concepto, @monto, @usuario_nombre)`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

router.post('/liquidacion', async (req, res) => {
  const { juntador_id, periodo_desde, periodo_hasta, precio_kilo, anticipos, observacion } = req.body;
  if (!juntador_id || !periodo_desde || !periodo_hasta || !precio_kilo) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const req1 = new sql.Request(transaction);
    const kilosResult = await req1
      .input('juntador_id', sql.Int, juntador_id)
      .input('desde', sql.DateTime, periodo_desde)
      .input('hasta', sql.DateTime, periodo_hasta + 'T23:59:59')
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total_kilos FROM Juntada
              WHERE juntador_id = @juntador_id AND fecha_hora BETWEEN @desde AND @hasta`);

    const kilos = parseFloat(kilosResult.recordset[0].total_kilos);
    const total_bruto = kilos * parseFloat(precio_kilo);
    const anticipos_num = parseFloat(anticipos) || 0;
    const saldo_final = total_bruto - anticipos_num;

    const req2 = new sql.Request(transaction);
    await req2
      .input('juntador_id', sql.Int, juntador_id)
      .input('periodo_desde', sql.Date, periodo_desde)
      .input('periodo_hasta', sql.Date, periodo_hasta)
      .input('kilos_liquidados', sql.Decimal(10,2), kilos)
      .input('precio_kilo', sql.Decimal(10,2), precio_kilo)
      .input('anticipos', sql.Decimal(10,2), anticipos_num)
      .input('total_bruto', sql.Decimal(10,2), total_bruto)
      .input('monto', sql.Decimal(10,2), saldo_final)
      .input('saldo_final', sql.Decimal(10,2), saldo_final)
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO Pagos (juntador_id, tipo, monto, periodo_desde, periodo_hasta,
              kilos_liquidados, precio_kilo, anticipos, total_bruto, saldo_final, observacion)
              VALUES (@juntador_id, 'liquidacion', @monto, @periodo_desde, @periodo_hasta,
              @kilos_liquidados, @precio_kilo, @anticipos, @total_bruto, @saldo_final, @observacion)`);

    const req3 = new sql.Request(transaction);
    await req3
      .input('concepto', sql.NVarChar, 'Liquidacion trabajador')
      .input('monto', sql.Decimal(10,2), saldo_final)
      .input('usuario_nombre', sql.NVarChar, req.user ? req.user.nombre : null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, usuario_nombre) VALUES ('egreso', @concepto, @monto, @usuario_nombre)`);

    await transaction.commit();
    res.json({ ok: true, kilos: kilos, total_bruto: total_bruto, saldo_final: saldo_final });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

router.get('/precio/:temporada_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('temporada_id', sql.Int, req.params.temporada_id)
      .query(`SELECT TOP 1 precio_kilo, destino, fecha_desde FROM PrecioHistorico
              WHERE temporada_id = @temporada_id AND (fecha_hasta IS NULL OR fecha_hasta >= GETDATE())
              ORDER BY fecha_desde DESC`);
    res.json(result.recordset[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/precio', async (req, res) => {
  const { temporada_id, precio_kilo, destino, fecha_desde } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    await new sql.Request(transaction)
      .input('temporada_id', sql.Int, temporada_id)
      .query(`UPDATE PrecioHistorico SET fecha_hasta = GETDATE()
              WHERE temporada_id = @temporada_id AND fecha_hasta IS NULL`);

    await new sql.Request(transaction)
      .input('temporada_id', sql.Int, temporada_id)
      .input('precio_kilo', sql.Decimal(10,2), precio_kilo)
      .input('destino', sql.NVarChar, destino || 'fresco')
      .input('fecha_desde', sql.Date, fecha_desde || new Date())
      .query(`INSERT INTO PrecioHistorico (temporada_id, precio_kilo, destino, fecha_desde)
              VALUES (@temporada_id, @precio_kilo, @destino, @fecha_desde)`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;