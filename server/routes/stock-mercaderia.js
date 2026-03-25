const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Resumen de stock de mercaderia por temporada
router.get('/', async (req, res) => {
  try {
    const temporada_id = req.query.temporada_id;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT l.nombre AS lote,
                 sm.destino,
                 SUM(CASE WHEN sm.tipo = 'ingreso'       THEN sm.kilos ELSE 0 END) AS kilos_ingresados,
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%'   THEN sm.kilos ELSE 0 END) AS kilos_egresados,
                 SUM(CASE WHEN sm.tipo = 'ingreso'       THEN sm.kilos ELSE 0 END) -
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%'   THEN sm.kilos ELSE 0 END) AS stock_actual,
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%'   THEN sm.kilos * sm.precio_kilo ELSE 0 END) AS total_vendido
                 FROM StockMercaderia sm
                 JOIN Lotes l ON sm.lote_id = l.id`;
    if (temporada_id) {
      query += ' WHERE sm.temporada_id = @temporada_id';
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    query += ' GROUP BY l.nombre, sm.destino ORDER BY l.nombre, sm.destino';
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar ingreso de mercaderia (desde juntada)
router.post('/ingreso', async (req, res) => {
  try {
    const { temporada_id, lote_id, kilos, destino, observacion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('temporada_id', sql.Int, temporada_id)
      .input('lote_id', sql.Int, lote_id)
      .input('kilos', sql.Decimal(10,2), kilos)
      .input('destino', sql.NVarChar, destino || 'fresco')
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO StockMercaderia (temporada_id, lote_id, tipo, kilos, destino, observacion)
              VALUES (@temporada_id, @lote_id, 'ingreso', @kilos, @destino, @observacion)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar egreso / venta de mercaderia
router.post('/egreso', async (req, res) => {
  const { temporada_id, lote_id, kilos, destino, precio_kilo, comprador, observacion } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const kilosNum = parseFloat(kilos);
    const precioNum = precio_kilo ? parseFloat(precio_kilo) : null;

    // 1. StockMercaderia — egreso
    await new sql.Request(transaction)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('lote_id',      sql.Int,           lote_id)
      .input('kilos',        sql.Decimal(10,2), kilosNum)
      .input('destino',      sql.NVarChar,      destino || 'fresco')
      .input('precio_kilo',  sql.Decimal(10,2), precioNum)
      .input('comprador',    sql.NVarChar,      comprador || '')
      .input('observacion',  sql.NVarChar,      observacion || '')
      .query(`INSERT INTO StockMercaderia (temporada_id, lote_id, tipo, kilos, destino, precio_kilo, comprador, observacion)
              VALUES (@temporada_id, @lote_id, 'egreso_venta', @kilos, @destino, @precio_kilo, @comprador, @observacion)`);

    // 2. Caja — ingreso por venta (solo si hay precio_kilo > 0)
    if (precioNum && precioNum > 0) {
      const total = kilosNum * precioNum;
      await new sql.Request(transaction)
        .input('concepto',     sql.NVarChar,      `Venta mercadería${comprador ? ' a ' + comprador : ''}`)
        .input('monto',        sql.Decimal(12,2), total)
        .input('temporada_id', sql.Int,           temporada_id || null)
        .input('observacion',  sql.NVarChar,      observacion || '')
        .query(`INSERT INTO Caja (tipo, concepto, monto, temporada_id, observacion)
                VALUES ('ingreso', @concepto, @monto, @temporada_id, @observacion)`);
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// KPIs de kg: cosechados (Juntada) + deposito/vendidos/descartados (MovimientosDeposito)
router.get('/kpis', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();

    // KG cosechados desde Juntada
    const dbJ = pool.request();
    let qJuntada = `SELECT ISNULL(SUM(j.kilos), 0) AS kg_cosechados
                    FROM Juntada j JOIN Lotes l ON j.lote_id = l.id`;
    if (temporada_id) {
      qJuntada += ' WHERE l.temporada_id = @temporada_id';
      dbJ.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    const jRes = await dbJ.query(qJuntada);

    // KG en depósito / vendidos / descartados desde MovimientosDeposito
    const dbM = pool.request();
    let qMov = `SELECT
      ISNULL(SUM(CASE WHEN tipo='ingreso'         THEN kilos ELSE 0 END),0) -
      ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%'    THEN kilos ELSE 0 END),0) AS kg_en_deposito,
      ISNULL(SUM(CASE WHEN tipo='egreso_venta'    THEN kilos ELSE 0 END),0) AS kg_vendidos,
      ISNULL(SUM(CASE WHEN tipo='egreso_descarte' THEN kilos ELSE 0 END),0) AS kg_descartados
      FROM MovimientosDeposito`;
    if (temporada_id) {
      qMov += ' WHERE temporada_id = @tid';
      dbM.input('tid', sql.Int, parseInt(temporada_id));
    }
    const mRes = await dbM.query(qMov);

    // KG venta_directa (desde StockMercaderia — no pasan por depósito)
    const dbSm = pool.request();
    let qSm = `SELECT ISNULL(SUM(kilos),0) AS kg_vd FROM StockMercaderia
               WHERE tipo='egreso_venta' AND destino='venta_directa'`;
    if (temporada_id) {
      qSm += ' AND temporada_id = @tid_sm';
      dbSm.input('tid_sm', sql.Int, parseInt(temporada_id));
    }
    const smRes = await dbSm.query(qSm);

    res.json({
      kg_cosechados:  parseFloat(jRes.recordset[0].kg_cosechados),
      kg_en_deposito: parseFloat(mRes.recordset[0].kg_en_deposito),
      kg_vendidos:    parseFloat(mRes.recordset[0].kg_vendidos) + parseFloat(smRes.recordset[0].kg_vd),
      kg_descartados: parseFloat(mRes.recordset[0].kg_descartados)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de movimientos: MovimientosDeposito + ventas directas de StockMercaderia
router.get('/historial', async (req, res) => {
  try {
    const { temporada_id, desde, hasta, lote_id, tipo } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();

    // Filtros reutilizables
    let wMov = '1=1';
    let wSm  = "sm.destino = 'venta_directa' AND sm.tipo = 'egreso_venta'";

    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      wMov += ' AND m.temporada_id = @temporada_id';
      wSm  += ' AND sm.temporada_id = @temporada_id';
    }
    if (desde) {
      dbReq.input('desde', sql.Date, desde);
      wMov += ' AND CAST(m.fecha AS DATE) >= @desde';
      wSm  += ' AND CAST(sm.fecha AS DATE) >= @desde';
    }
    if (hasta) {
      dbReq.input('hasta', sql.Date, hasta);
      wMov += ' AND CAST(m.fecha AS DATE) <= @hasta';
      wSm  += ' AND CAST(sm.fecha AS DATE) <= @hasta';
    }
    if (lote_id) {
      dbReq.input('lote_id', sql.Int, parseInt(lote_id));
      wMov += ' AND m.lote_id = @lote_id';
      wSm  += ' AND sm.lote_id = @lote_id';
    }

    // Filtro de tipo
    let tipoFiltroMov = '';
    let incluirSm = true;
    if (tipo === 'ingreso') {
      tipoFiltroMov = " AND m.tipo = 'ingreso'";
      incluirSm = false; // ventas directas son egresos
    } else if (tipo === 'egreso') {
      tipoFiltroMov = " AND m.tipo LIKE 'egreso%'";
    }

    const smUnion = incluirSm ? `
      UNION ALL
      SELECT
        sm.id,
        'egreso_venta'         AS tipo,
        sm.kilos,
        sm.precio_kilo,
        CASE WHEN sm.precio_kilo IS NOT NULL THEN sm.kilos * sm.precio_kilo ELSE NULL END AS total,
        sm.comprador,
        'venta_directa'        AS destino_venta,
        sm.observacion,
        CAST(sm.fecha AS DATETIME) AS fecha,
        NULL                   AS deposito,
        l2.nombre              AS lote,
        t2.nombre              AS temporada,
        uj2.cosechero          AS cosechero,
        sm.juntada_id
      FROM StockMercaderia sm
      LEFT JOIN Lotes      l2 ON sm.lote_id      = l2.id
      LEFT JOIN Temporadas t2 ON sm.temporada_id = t2.id
      LEFT JOIN (
        SELECT j.lote_id, l.temporada_id,
               ju.apellido + ', ' + ju.nombre AS cosechero,
               ROW_NUMBER() OVER (PARTITION BY j.lote_id, l.temporada_id ORDER BY j.fecha_hora DESC) AS rn
        FROM Juntada j
        JOIN Lotes l ON j.lote_id = l.id
        JOIN Juntadores ju ON j.juntador_id = ju.id
      ) uj2 ON sm.lote_id = uj2.lote_id AND sm.temporada_id = uj2.temporada_id AND uj2.rn = 1
      WHERE ${wSm}` : '';

    const query = `
      WITH UltimoJuntador AS (
        SELECT j.lote_id, l.temporada_id,
               ju.apellido + ', ' + ju.nombre AS cosechero,
               ROW_NUMBER() OVER (PARTITION BY j.lote_id, l.temporada_id ORDER BY j.fecha_hora DESC) AS rn
        FROM Juntada j
        JOIN Lotes l ON j.lote_id = l.id
        JOIN Juntadores ju ON j.juntador_id = ju.id
      )
      SELECT m.id, m.tipo, m.kilos, m.precio_kilo,
             CASE WHEN m.precio_kilo IS NOT NULL THEN m.kilos * m.precio_kilo ELSE NULL END AS total,
             m.comprador, m.destino_venta, m.observacion, m.fecha,
             d.nombre AS deposito, l.nombre AS lote, t.nombre AS temporada,
             uj.cosechero, m.juntada_id
      FROM MovimientosDeposito m
      LEFT JOIN Depositos      d  ON m.deposito_id  = d.id
      LEFT JOIN Lotes          l  ON m.lote_id      = l.id
      LEFT JOIN Temporadas     t  ON m.temporada_id = t.id
      LEFT JOIN UltimoJuntador uj ON m.lote_id = uj.lote_id AND m.temporada_id = uj.temporada_id AND uj.rn = 1
      WHERE ${wMov}${tipoFiltroMov}
      ${smUnion}
      ORDER BY fecha DESC`;

    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;