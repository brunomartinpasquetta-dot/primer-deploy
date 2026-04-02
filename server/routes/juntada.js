const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// POST /api/juntada
// Body: { parcela_id, juntador_id, kilos, operador?, observacion?,
//         destinos?: [{ tipo, kilos, deposito_id?, precio_kilo?, comprador?, motivo? }] }
// Crea la Juntada + inserta JuntadaDestino por cada tramo de distribución.
// Destinos fresco → MovimientosDeposito + StockMercaderia inmediato.
// Destinos cámara (requiere_despalillado=1) → stock_pendiente=1, procesado al despalillar.
router.post('/', async (req, res) => {
  try {
    const { parcela_id, juntador_id, kilos, operador, observacion, destinos } = req.body;
    if (!parcela_id || !juntador_id) return res.status(400).json({ error: 'Parcela y juntador son obligatorios' });
    if (!kilos || parseFloat(kilos) <= 0) return res.status(400).json({ error: 'Kilos debe ser mayor a 0' });
    const pool = await getPool();

    const parcelaResult = await pool.request()
      .input('parcela_id', sql.Int, parcela_id)
      .query('SELECT temporada_id FROM Parcelas WHERE id = @parcela_id');
    const temporada_id = parcelaResult.recordset.length ? parcelaResult.recordset[0].temporada_id : null;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Insertar juntada
      const uid = req.user ? req.user.id : null;
      const insertResult = await transaction.request()
        .input('parcela_id',  sql.Int,          parcela_id)
        .input('juntador_id', sql.Int,          juntador_id)
        .input('kilos',       sql.Decimal(8, 2),kilos)
        .input('operador',    sql.NVarChar,     operador || '')
        .input('observacion', sql.NVarChar,     observacion || '')
        .input('usuario_id',  sql.Int,          uid)
        .query(`INSERT INTO Juntada (parcela_id, juntador_id, kilos, operador, observacion, usuario_id)
                OUTPUT INSERTED.id
                VALUES (@parcela_id, @juntador_id, @kilos, @operador, @observacion, @usuario_id)`);

      const newId = insertResult.recordset[0].id;

      // 2. Procesar destinos
      if (destinos && destinos.length > 0) {
        // Obtener info de depósitos involucrados
        let depositoInfo = {};
        const depIds = [...new Set(destinos.filter(d => d.tipo === 'deposito' && d.deposito_id).map(d => parseInt(d.deposito_id)))];
        if (depIds.length > 0) {
          const depReq = transaction.request();
          const depPlaceholders = depIds.map((id, i) => { depReq.input(`depId${i}`, sql.Int, id); return `@depId${i}`; });
          const depRes = await depReq.query(`SELECT id, tipo, requiere_despalillado FROM Depositos WHERE id IN (${depPlaceholders.join(',')})`);
          depRes.recordset.forEach(r => { depositoInfo[r.id] = r; });
        }

        // Resumen para Juntada: destino y deposito_id de referencia
        const tipos = [...new Set(destinos.map(d => d.tipo))];
        const destinoResumen = tipos.length === 1 ? tipos[0] : 'mixto';
        const ventaDirecta = destinos.find(d => d.tipo === 'venta_directa');
        // Para stock_pendiente en Juntada: basta con que haya AL MENOS UN destino pendiente
        const hayPendiente = destinos.some(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado);
        // deposito_id de referencia: preferir el pendiente si existe
        const depRef = destinos.find(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado)
                    || destinos.find(d => d.tipo === 'deposito');

        await transaction.request()
          .input('id',                   sql.Int,          newId)
          .input('destino',              sql.NVarChar,     destinoResumen)
          .input('deposito_id',          sql.Int,          depRef ? depRef.deposito_id : null)
          .input('precio_venta_directa', sql.Decimal(10,3),ventaDirecta ? ventaDirecta.precio_kilo || null : null)
          .input('comprador_directo',    sql.NVarChar,     ventaDirecta ? ventaDirecta.comprador || '' : '')
          .input('stock_pendiente',      sql.Bit,          hayPendiente ? 1 : 0)
          .query(`UPDATE Juntada SET destino=@destino, deposito_id=@deposito_id,
                  precio_venta_directa=@precio_venta_directa, comprador_directo=@comprador_directo,
                  stock_pendiente=@stock_pendiente
                  WHERE id=@id`);

        const now = new Date();

        for (const d of destinos) {
          if (!d.kilos || parseFloat(d.kilos) <= 0) continue;

          const esPendiente = d.tipo === 'deposito' && !!depositoInfo[d.deposito_id]?.requiere_despalillado;

          // 2a. Registrar en JuntadaDestino (fuente de verdad de distribución)
          await transaction.request()
            .input('jd_juntada_id',      sql.Int,          newId)
            .input('jd_tipo',            sql.NVarChar,     d.tipo)
            .input('jd_deposito_id',     sql.Int,          d.deposito_id || null)
            .input('jd_kilos',           sql.Decimal(10,3),d.kilos)
            .input('jd_stock_pendiente', sql.Bit,          esPendiente ? 1 : 0)
            .input('jd_precio_kilo',     sql.Decimal(10,3),d.precio_kilo || null)
            .input('jd_comprador',       sql.NVarChar,     d.comprador || null)
            .input('jd_motivo',          sql.NVarChar,     d.motivo || null)
            .query(`INSERT INTO JuntadaDestino
                    (juntada_id, tipo, deposito_id, kilos, stock_pendiente, precio_kilo, comprador, motivo)
                    VALUES (@jd_juntada_id, @jd_tipo, @jd_deposito_id, @jd_kilos,
                            @jd_stock_pendiente, @jd_precio_kilo, @jd_comprador, @jd_motivo)`);

          // 2b. Movimientos según tipo
          if (d.tipo === 'deposito') {
            // Cámara fría (requiere_despalillado): stock se registra al despalillar
            if (esPendiente) continue;

            await transaction.request()
              .input('deposito_id',  sql.Int,          d.deposito_id)
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',      sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Juntada #${newId}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO MovimientosDeposito
                      (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

            await transaction.request()
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',      sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Juntada #${newId}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, parcela_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, 'deposito', @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

          } else if (d.tipo === 'venta_directa') {
            await transaction.request()
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',      sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('precio_kilo',  sql.Decimal(10,3),d.precio_kilo || null)
              .input('comprador',    sql.NVarChar,     d.comprador || '')
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Venta directa juntada #${newId}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, comprador, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, 'venta_directa', @precio_kilo, @comprador, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id);
                      INSERT INTO StockMercaderia
                      (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, comprador, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @parcela_id, 'egreso_venta', @kilos, 'venta_directa', @precio_kilo, @comprador, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

            if (d.precio_kilo && parseFloat(d.precio_kilo) > 0) {
              const total = parseFloat(d.kilos) * parseFloat(d.precio_kilo);
              await transaction.request()
                .input('concepto',       sql.NVarChar,     `Venta directa juntada #${newId}${d.comprador ? ' a ' + d.comprador : ''}`)
                .input('monto',          sql.Decimal(12,2),total)
                .input('temporada_id',   sql.Int,          temporada_id)
                .input('usuario_nombre', sql.NVarChar,     req.user ? req.user.nombre : null)
                .query(`INSERT INTO Caja (tipo, concepto, monto, temporada_id, usuario_nombre)
                        VALUES ('ingreso', @concepto, @monto, @temporada_id, @usuario_nombre)`);
            }

          } else if (d.tipo === 'descarte') {
            await transaction.request()
              .input('temporada_id', sql.Int,          temporada_id)
              .input('parcela_id',      sql.Int,          parcela_id)
              .input('kilos',        sql.Decimal(10,3),d.kilos)
              .input('fecha',        sql.DateTime,     now)
              .input('observacion',  sql.NVarChar,     `Descarte juntada #${newId}: ${d.motivo || ''}`)
              .input('juntada_id',   sql.Int,          newId)
              .input('juntador_id',  sql.Int,          juntador_id)
              .input('usuario_id',   sql.Int,          uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @parcela_id, 'egreso_descarte', @kilos, 'descarte', 0, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
          }
        }
      }

      await transaction.commit();
      res.json({ ok: true, id: newId });

    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/juntada/:id/destino  — asignar destinos a una juntada ya registrada
// Body: { destinos: [{ tipo, kilos, deposito_id?, motivo? }] }
router.post('/:id/destino', async (req, res) => {
  const juntadaId = parseInt(req.params.id);
  const { destinos } = req.body;

  if (!destinos || !destinos.length) {
    return res.status(400).json({ error: 'Destinos requeridos' });
  }

  const VALIDOS = ['deposito', 'descarte'];
  const invalidos = destinos.map(d => d.tipo).filter(t => !VALIDOS.includes(t));
  if (invalidos.length) {
    return res.status(400).json({ error: 'Destino inválido: ' + invalidos.join(', ') });
  }

  const pool = await getPool();

  const jRes = await pool.request()
    .input('id', sql.Int, juntadaId)
    .query(`SELECT j.id, j.juntador_id, j.kilos, j.parcela_id, l.temporada_id
            FROM Juntada j JOIN Parcelas l ON j.parcela_id = l.id WHERE j.id = @id`);

  if (!jRes.recordset.length) return res.status(404).json({ error: 'Juntada no encontrada' });
  const juntada = jRes.recordset[0];

  const sumaDestinos = destinos.reduce((s, d) => s + (parseFloat(d.kilos) || 0), 0);
  if (Math.abs(sumaDestinos - parseFloat(juntada.kilos)) > 0.01) {
    return res.status(400).json({
      error: `Quedan ${(parseFloat(juntada.kilos) - sumaDestinos).toFixed(2)} kg sin asignar`
    });
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Info depósitos
    let depositoInfo = {};
    const depIds = [...new Set(destinos.filter(d => d.tipo === 'deposito' && d.deposito_id).map(d => parseInt(d.deposito_id)))];
    if (depIds.length > 0) {
      const depReq = transaction.request();
      const depPlaceholders = depIds.map((id, i) => { depReq.input(`depId${i}`, sql.Int, id); return `@depId${i}`; });
      const depRes = await depReq.query(`SELECT id, tipo, requiere_despalillado FROM Depositos WHERE id IN (${depPlaceholders.join(',')})`);
      depRes.recordset.forEach(r => { depositoInfo[r.id] = r; });
    }

    const tipos = [...new Set(destinos.map(d => d.tipo))];
    const destinoResumen = tipos.length === 1 ? tipos[0] : 'mixto';
    const hayPendiente = destinos.some(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado);
    const depRef = destinos.find(d => d.tipo === 'deposito' && depositoInfo[d.deposito_id]?.requiere_despalillado)
                || destinos.find(d => d.tipo === 'deposito');

    await transaction.request()
      .input('id',              sql.Int,      juntadaId)
      .input('destino',         sql.NVarChar, destinoResumen)
      .input('deposito_id',     sql.Int,      depRef ? depRef.deposito_id : null)
      .input('stock_pendiente', sql.Bit,      hayPendiente ? 1 : 0)
      .query(`UPDATE Juntada SET destino=@destino, deposito_id=@deposito_id, stock_pendiente=@stock_pendiente WHERE id=@id`);

    const now = new Date();
    const uid = req.user ? req.user.id : null;
    const { parcela_id, temporada_id, juntador_id } = juntada;

    for (const d of destinos) {
      if (!d.kilos || parseFloat(d.kilos) <= 0) continue;
      const esPendiente = d.tipo === 'deposito' && !!depositoInfo[d.deposito_id]?.requiere_despalillado;

      await transaction.request()
        .input('jd_juntada_id',      sql.Int,          juntadaId)
        .input('jd_tipo',            sql.NVarChar,     d.tipo)
        .input('jd_deposito_id',     sql.Int,          d.deposito_id || null)
        .input('jd_kilos',           sql.Decimal(10,3),d.kilos)
        .input('jd_stock_pendiente', sql.Bit,          esPendiente ? 1 : 0)
        .input('jd_motivo',          sql.NVarChar,     d.motivo || null)
        .query(`INSERT INTO JuntadaDestino (juntada_id, tipo, deposito_id, kilos, stock_pendiente, motivo)
                VALUES (@jd_juntada_id, @jd_tipo, @jd_deposito_id, @jd_kilos, @jd_stock_pendiente, @jd_motivo)`);

      if (d.tipo === 'deposito') {
        if (esPendiente) continue;
        await transaction.request()
          .input('deposito_id',  sql.Int,          d.deposito_id)
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',      sql.Int,          parcela_id)
          .input('kilos',        sql.Decimal(10,3),d.kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Juntada #${juntadaId}`)
          .input('juntada_id',   sql.Int,          juntadaId)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso', @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
        await transaction.request()
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',      sql.Int,          parcela_id)
          .input('kilos',        sql.Decimal(10,3),d.kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Juntada #${juntadaId}`)
          .input('juntada_id',   sql.Int,          juntadaId)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, parcela_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, 'deposito', @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

      } else if (d.tipo === 'descarte') {
        await transaction.request()
          .input('temporada_id', sql.Int,          temporada_id)
          .input('parcela_id',      sql.Int,          parcela_id)
          .input('kilos',        sql.Decimal(10,3),d.kilos)
          .input('fecha',        sql.DateTime,     now)
          .input('observacion',  sql.NVarChar,     `Descarte juntada #${juntadaId}: ${d.motivo || ''}`)
          .input('juntada_id',   sql.Int,          juntadaId)
          .input('juntador_id',  sql.Int,          juntador_id)
          .input('usuario_id',   sql.Int,          uid)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@temporada_id, @parcela_id, 'egreso_descarte', @kilos, 'descarte', 0, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
      }
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// GET /api/juntada/hoy  — juntadas del día con sus destinos
router.get('/hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT j.id, l.nombre AS parcela,
              ju.apellido + ', ' + ju.nombre AS juntador,
              j.kilos, j.fecha_hora, j.destino, j.stock_pendiente
              FROM Juntada j
              JOIN Parcelas l ON j.parcela_id = l.id
              JOIN Juntadores ju ON j.juntador_id = ju.id
              WHERE CAST(j.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY j.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/juntada/destinos-hoy
// Devuelve filas de JuntadaDestino para las juntadas de HOY.
// Incluye destinos fresco (ya en stock) y pendientes (esperando despalillado).
router.get('/destinos-hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT
                jd.id          AS destino_id,
                jd.juntada_id,
                jd.tipo,
                jd.kilos,
                jd.stock_pendiente,
                jd.deposito_id,
                d.nombre       AS deposito,
                j.fecha_hora   AS fecha,
                j.parcela_id,
                l.nombre AS parcela,
                j.juntador_id,
                ju.apellido + ', ' + ju.nombre AS cosechero,
                j.usuario_id,
                u.nombre AS usuario
              FROM JuntadaDestino jd
              JOIN Juntada    j  ON jd.juntada_id = j.id
              JOIN Parcelas   l  ON j.parcela_id  = l.id
              JOIN Juntadores ju ON j.juntador_id = ju.id
              LEFT JOIN Depositos d  ON jd.deposito_id = d.id
              LEFT JOIN Usuarios  u  ON j.usuario_id   = u.id
              WHERE CAST(j.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY j.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/juntada/pendientes-stock
router.get('/pendientes-stock', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let q = `SELECT COUNT(*) AS cantidad, ISNULL(SUM(jd.kilos), 0) AS total_kg
             FROM JuntadaDestino jd
             JOIN Juntada j ON jd.juntada_id = j.id
             JOIN Parcelas l ON j.parcela_id = l.id
             WHERE jd.stock_pendiente = 1`;
    if (temporada_id) { q += ` AND l.temporada_id = @temporada_id`; dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); }
    const result = await dbReq.query(q);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/juntada/historial — historial completo filtrable
router.get('/historial', async (req, res) => {
  try {
    const { temporada_id, desde, hasta, juntador_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id)  { where += ' AND l.temporada_id = @tid';                dbReq.input('tid',   sql.Int,  parseInt(temporada_id)); }
    if (desde)         { where += ' AND CAST(j.fecha_hora AS DATE) >= @desde'; dbReq.input('desde', sql.Date, desde); }
    if (hasta)         { where += ' AND CAST(j.fecha_hora AS DATE) <= @hasta'; dbReq.input('hasta', sql.Date, hasta); }
    if (juntador_id)   { where += ' AND j.juntador_id = @jid';                dbReq.input('jid',   sql.Int,  parseInt(juntador_id)); }
    const result = await dbReq.query(`
      SELECT j.id, l.nombre AS parcela,
             ju.apellido + ', ' + ju.nombre AS cosechero,
             j.kilos, j.fecha_hora AS fecha, j.juntador_id,
             j.usuario_id, u.nombre AS usuario,
             t.nombre AS temporada
      FROM Juntada j
      JOIN Parcelas l ON j.parcela_id = l.id
      JOIN Juntadores ju ON j.juntador_id = ju.id
      LEFT JOIN Temporadas t ON l.temporada_id = t.id
      LEFT JOIN Usuarios u ON j.usuario_id = u.id
      WHERE ${where}
      ORDER BY j.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/juntada/totales-por-juntador — totales campaña activa
router.get('/totales-por-juntador', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id) { where += ' AND l.temporada_id = @tid'; dbReq.input('tid', sql.Int, parseInt(temporada_id)); }
    const result = await dbReq.query(`
      SELECT
        ju.apellido + ', ' + ju.nombre AS cosechero,
        COUNT(j.id)       AS registros,
        SUM(j.kilos)      AS kg_total,
        MIN(j.fecha_hora) AS primera_fecha,
        MAX(j.fecha_hora) AS ultima_fecha
      FROM Juntada j
      JOIN Parcelas l ON j.parcela_id = l.id
      JOIN Juntadores ju ON j.juntador_id = ju.id
      WHERE ${where}
      GROUP BY ju.id, ju.apellido, ju.nombre
      ORDER BY kg_total DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
