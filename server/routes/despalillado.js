const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// GET /api/despalillado/pendientes
// Juntadas con destino cámara fría que aún no pasaron por despalillado (stock_pendiente=1)
router.get('/pendientes', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT j.id, j.kilos, j.fecha_hora,
              l.nombre AS lote, l.id AS lote_id,
              ju.apellido + ', ' + ju.nombre AS juntador,
              d.id AS deposito_id, d.nombre AS deposito_nombre
              FROM Juntada j
              JOIN Lotes l ON j.lote_id = l.id
              JOIN Juntadores ju ON j.juntador_id = ju.id
              JOIN Depositos d ON j.deposito_id = d.id
              WHERE j.stock_pendiente = 1
              ORDER BY j.fecha_hora ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/despalillado
// Body: { lote_id, despalillador_id, kilos, operador?, juntada_id? }
// Si viene juntada_id: es un despalillado de cámara fría — inserta MovimientosDeposito + StockMercaderia
router.post('/', async (req, res) => {
  try {
    const { lote_id, despalillador_id, kilos, operador, juntada_id } = req.body;
    const pool = await getPool();

    if (juntada_id) {
      // Flujo cámara fría: obtener datos de la juntada pendiente
      const jRes = await pool.request()
        .input('id', sql.Int, juntada_id)
        .query(`SELECT j.id, j.deposito_id, j.juntador_id, j.stock_pendiente,
                j.kilos AS kilos_juntada, l.temporada_id, j.lote_id
                FROM Juntada j JOIN Lotes l ON j.lote_id = l.id
                WHERE j.id = @id`);

      if (!jRes.recordset.length) {
        return res.status(404).json({ error: 'Juntada no encontrada' });
      }
      const juntada = jRes.recordset[0];
      if (!juntada.stock_pendiente) {
        return res.status(400).json({ error: 'Esta juntada ya fue procesada o no requiere despalillado' });
      }

      const { deposito_id, temporada_id, lote_id: jLoteId, kilos_juntada } = juntada;
      const now = new Date();
      const uid = req.user ? req.user.id : null;

      // Calcular merma
      const kilosNum      = parseFloat(kilos);
      const kilosJuntNum  = parseFloat(kilos_juntada);
      const merma_kg      = Math.max(0, parseFloat((kilosJuntNum - kilosNum).toFixed(2)));
      const merma_pct     = kilosJuntNum > 0
        ? parseFloat(((merma_kg / kilosJuntNum) * 100).toFixed(2))
        : 0;

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        // 1. Registrar el despalillado con merma
        await transaction.request()
          .input('lote_id',          sql.Int,           jLoteId)
          .input('despalillador_id', sql.Int,           despalillador_id)
          .input('kilos',            sql.Decimal(10,2), kilos)
          .input('operador',         sql.NVarChar,      operador || '')
          .input('juntada_id',       sql.Int,           juntada_id)
          .input('deposito_id',      sql.Int,           deposito_id)
          .input('merma_kg',         sql.Decimal(10,2), merma_kg)
          .input('merma_pct',        sql.Decimal(5,2),  merma_pct)
          .query(`INSERT INTO Despalillado (lote_id, despalillador_id, kilos, operador, juntada_id, deposito_id, merma_kg, merma_pct)
                  VALUES (@lote_id, @despalillador_id, @kilos, @operador, @juntada_id, @deposito_id, @merma_kg, @merma_pct)`);

        // 2. Insertar en MovimientosDeposito (ingreso a la cámara)
        await transaction.request()
          .input('deposito_id',  sql.Int,           deposito_id)
          .input('temporada_id', sql.Int,           temporada_id)
          .input('lote_id',      sql.Int,           jLoteId)
          .input('kilos',        sql.Decimal(10,2), kilos)
          .input('fecha',        sql.DateTime,      now)
          .input('observacion',  sql.NVarChar,      `Despalillado juntada #${juntada_id}`)
          .input('juntada_id',   sql.Int,           juntada_id)
          .input('juntador_id',  sql.Int,           juntada.juntador_id)
          .input('usuario_id',   sql.Int,           uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, lote_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@deposito_id, @temporada_id, @lote_id, 'ingreso', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

        // 3. Insertar en StockMercaderia
        await transaction.request()
          .input('temporada_id', sql.Int,           temporada_id)
          .input('lote_id',      sql.Int,           jLoteId)
          .input('kilos',        sql.Decimal(10,2), kilos)
          .input('fecha',        sql.DateTime,      now)
          .input('observacion',  sql.NVarChar,      `Despalillado juntada #${juntada_id}`)
          .input('juntada_id',   sql.Int,           juntada_id)
          .input('juntador_id',  sql.Int,           juntada.juntador_id)
          .input('usuario_id',   sql.Int,           uid)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, lote_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@temporada_id, @lote_id, 'ingreso', @kilos, 'deposito', @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

        // 4. Marcar juntada como procesada
        await transaction.request()
          .input('id', sql.Int, juntada_id)
          .query(`UPDATE Juntada SET stock_pendiente = 0 WHERE id = @id`);

        await transaction.commit();
        res.json({ ok: true, merma_kg, merma_pct });
      } catch (innerErr) {
        await transaction.rollback();
        throw innerErr;
      }

    } else {
      // Flujo normal (fruta fresca): solo registra el despalillado, sin afectar stock
      await pool.request()
        .input('lote_id',          sql.Int,          lote_id)
        .input('despalillador_id', sql.Int,           despalillador_id)
        .input('kilos',            sql.Decimal(8,2),  kilos)
        .input('operador',         sql.NVarChar,      operador || '')
        .query(`INSERT INTO Despalillado (lote_id, despalillador_id, kilos, operador)
                VALUES (@lote_id, @despalillador_id, @kilos, @operador)`);
      res.json({ ok: true });
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/despalillado/hoy
router.get('/hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT d.id, l.nombre AS lote,
              ju.apellido + ', ' + ju.nombre AS despalillador,
              d.kilos, d.fecha_hora, d.juntada_id,
              d.merma_kg, d.merma_pct,
              j.kilos AS kilos_juntada,
              dep.nombre AS deposito_nombre
              FROM Despalillado d
              JOIN Lotes l ON d.lote_id = l.id
              JOIN Juntadores ju ON d.despalillador_id = ju.id
              LEFT JOIN Depositos dep ON d.deposito_id = dep.id
              LEFT JOIN Juntada j ON d.juntada_id = j.id
              WHERE CAST(d.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY d.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
