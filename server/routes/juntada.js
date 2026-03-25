const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Registrar juntada en un solo paso — acepta destinos opcionales en el mismo llamado
// Body: { lote_id, juntador_id, kilos, operador?, observacion?,
//         destinos?: [{ tipo, kilos, deposito_id?, precio_kilo?, comprador?, motivo? }] }
router.post('/', async (req, res) => {
  try {
    const { lote_id, juntador_id, kilos, operador, observacion, destinos } = req.body;
    const pool = await getPool();

    // 1. Obtener temporada_id del lote
    const loteResult = await pool.request()
      .input('lote_id', sql.Int, lote_id)
      .query('SELECT temporada_id FROM Lotes WHERE id = @lote_id');
    const temporada_id = loteResult.recordset.length ? loteResult.recordset[0].temporada_id : null;

    // 2. Transacción
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // a. INSERT juntada
      const insertResult = await transaction.request()
        .input('lote_id',     sql.Int,           lote_id)
        .input('juntador_id', sql.Int,            juntador_id)
        .input('kilos',       sql.Decimal(8, 2),  kilos)
        .input('operador',    sql.NVarChar,       operador || '')
        .input('observacion', sql.NVarChar,       observacion || '')
        .query(`INSERT INTO Juntada (lote_id, juntador_id, kilos, operador, observacion)
                OUTPUT INSERTED.id
                VALUES (@lote_id, @juntador_id, @kilos, @operador, @observacion)`);

      const newId = insertResult.recordset[0].id;

      // b. Procesar destinos si vienen informados
      if (destinos && destinos.length > 0) {
        const tipos = [...new Set(destinos.map(d => d.tipo))];
        const destinoResumen = tipos.length === 1 ? tipos[0] : 'mixto';
        const ventaDirecta = destinos.find(d => d.tipo === 'venta_directa');
        const depItem = destinos.find(d => d.tipo === 'deposito');

        await transaction.request()
          .input('id',                   sql.Int,           newId)
          .input('destino',              sql.NVarChar,      destinoResumen)
          .input('deposito_id',          sql.Int,           depItem ? depItem.deposito_id : null)
          .input('precio_venta_directa', sql.Decimal(10,2), ventaDirecta ? ventaDirecta.precio_kilo || null : null)
          .input('comprador_directo',    sql.NVarChar,      ventaDirecta ? ventaDirecta.comprador || '' : '')
          .query(`UPDATE Juntada SET destino=@destino, deposito_id=@deposito_id,
                  precio_venta_directa=@precio_venta_directa, comprador_directo=@comprador_directo
                  WHERE id=@id`);

        for (const d of destinos) {
          if (!d.kilos || parseFloat(d.kilos) <= 0) continue;

          const now = new Date();
          const uid = req.user ? req.user.id : null;

          if (d.tipo === 'deposito') {
            await transaction.request()
              .input('deposito_id',  sql.Int,           d.deposito_id)
              .input('temporada_id', sql.Int,           temporada_id)
              .input('lote_id',      sql.Int,           lote_id)
              .input('tipo',         sql.NVarChar,      'ingreso')
              .input('kilos',        sql.Decimal(10,2), d.kilos)
              .input('fecha',        sql.DateTime,      now)
              .input('observacion',  sql.NVarChar,      `Juntada #${newId}`)
              .input('juntada_id',   sql.Int,           newId)
              .input('juntador_id',  sql.Int,           juntador_id)
              .input('usuario_id',   sql.Int,           uid)
              .query(`INSERT INTO MovimientosDeposito
                      (deposito_id, temporada_id, lote_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@deposito_id, @temporada_id, @lote_id, @tipo, @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

            await transaction.request()
              .input('sm_temporada_id', sql.Int,           temporada_id)
              .input('sm_lote_id',      sql.Int,           lote_id)
              .input('sm_kilos',        sql.Decimal(10,2), d.kilos)
              .input('sm_fecha',        sql.DateTime,      now)
              .input('sm_observacion',  sql.NVarChar,      `Juntada #${newId}`)
              .input('sm_juntada_id',   sql.Int,           newId)
              .input('sm_juntador_id',  sql.Int,           juntador_id)
              .input('sm_usuario_id',   sql.Int,           uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, lote_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@sm_temporada_id, @sm_lote_id, 'ingreso', @sm_kilos, 'deposito', @sm_fecha, @sm_observacion, @sm_juntada_id, @sm_juntador_id, @sm_usuario_id)`);

          } else if (d.tipo === 'venta_directa') {
            await transaction.request()
              .input('temporada_id', sql.Int,           temporada_id)
              .input('lote_id',      sql.Int,           lote_id)
              .input('kilos',        sql.Decimal(10,2), d.kilos)
              .input('precio_kilo',  sql.Decimal(10,2), d.precio_kilo || null)
              .input('comprador',    sql.NVarChar,      d.comprador || '')
              .input('fecha',        sql.DateTime,      now)
              .input('observacion',  sql.NVarChar,      `Venta directa juntada #${newId}`)
              .input('juntada_id',   sql.Int,           newId)
              .input('juntador_id',  sql.Int,           juntador_id)
              .input('usuario_id',   sql.Int,           uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, lote_id, tipo, kilos, destino, precio_kilo, comprador, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @lote_id, 'ingreso', @kilos, 'venta_directa', @precio_kilo, @comprador, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id);
                      INSERT INTO StockMercaderia
                      (temporada_id, lote_id, tipo, kilos, destino, precio_kilo, comprador, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @lote_id, 'egreso_venta', @kilos, 'venta_directa', @precio_kilo, @comprador, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

            if (d.precio_kilo && parseFloat(d.precio_kilo) > 0) {
              const total = parseFloat(d.kilos) * parseFloat(d.precio_kilo);
              await transaction.request()
                .input('vd_concepto',     sql.NVarChar,      `Venta directa juntada #${newId}${d.comprador ? ' a ' + d.comprador : ''}`)
                .input('vd_monto',        sql.Decimal(12,2), total)
                .input('vd_temporada_id', sql.Int,           temporada_id)
                .query(`INSERT INTO Caja (tipo, concepto, monto, temporada_id)
                        VALUES ('ingreso', @vd_concepto, @vd_monto, @vd_temporada_id)`);
            }

          } else if (d.tipo === 'descarte') {
            await transaction.request()
              .input('temporada_id', sql.Int,           temporada_id)
              .input('lote_id',      sql.Int,           lote_id)
              .input('kilos',        sql.Decimal(10,2), d.kilos)
              .input('fecha',        sql.DateTime,      now)
              .input('observacion',  sql.NVarChar,      `Descarte juntada #${newId}: ${d.motivo || ''}`)
              .input('juntada_id',   sql.Int,           newId)
              .input('juntador_id',  sql.Int,           juntador_id)
              .input('usuario_id',   sql.Int,           uid)
              .query(`INSERT INTO StockMercaderia
                      (temporada_id, lote_id, tipo, kilos, destino, precio_kilo, fecha, observacion, juntada_id, juntador_id, usuario_id)
                      VALUES (@temporada_id, @lote_id, 'egreso_descarte', @kilos, 'descarte', 0, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
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

const DESTINOS_VALIDOS = ['deposito', 'descarte'];

// Asignar destino a una juntada ya registrada
// Body: { destinos: [{ tipo, kilos, deposito_id?, motivo? }] }
// Destinos válidos: 'deposito', 'descarte'
// NOTA: 'venta_directa' no es válido aquí — se registra únicamente en POST /
router.post('/:id/destino', async (req, res) => {
  const juntadaId = parseInt(req.params.id);
  const { destinos } = req.body;

  if (!destinos || !destinos.length) {
    return res.status(400).json({ error: 'Destinos requeridos' });
  }

  // Validar tipos
  const tiposInvalidos = destinos.map(d => d.tipo).filter(t => !DESTINOS_VALIDOS.includes(t));
  if (tiposInvalidos.length > 0) {
    return res.status(400).json({
      error: 'Destino inválido: ' + tiposInvalidos.join(', ') + '. Válidos: ' + DESTINOS_VALIDOS.join(', ')
    });
  }

  const pool = await getPool();

  // Obtener datos de la juntada para validar
  const jRes = await pool.request()
    .input('id', sql.Int, juntadaId)
    .query(`SELECT j.id, j.juntador_id, j.kilos, j.lote_id, l.temporada_id
            FROM Juntada j JOIN Lotes l ON j.lote_id = l.id
            WHERE j.id = @id`);

  if (!jRes.recordset.length) {
    return res.status(404).json({ error: 'Juntada no encontrada' });
  }
  const juntada = jRes.recordset[0];

  if (!juntada.juntador_id) {
    return res.status(400).json({ error: 'Debe seleccionar un cosechero' });
  }

  const sumaDestinos = destinos.reduce((s, d) => s + (parseFloat(d.kilos) || 0), 0);
  const diff = Math.abs(sumaDestinos - parseFloat(juntada.kilos));
  if (diff > 0.01) {
    const restantes = (parseFloat(juntada.kilos) - sumaDestinos).toFixed(2);
    return res.status(400).json({
      error: `Quedan ${restantes} kg sin destino asignado (total juntada: ${juntada.kilos} kg, asignado: ${sumaDestinos.toFixed(2)} kg)`
    });
  }

  const { lote_id, temporada_id } = juntada;
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const tipos = [...new Set(destinos.map(d => d.tipo))];
    const destinoResumen = tipos.length === 1 ? tipos[0] : 'mixto';
    const depItem = destinos.find(d => d.tipo === 'deposito');

    await new sql.Request(transaction)
      .input('id',          sql.Int,      juntadaId)
      .input('destino',     sql.NVarChar, destinoResumen)
      .input('deposito_id', sql.Int,      depItem ? depItem.deposito_id : null)
      .query(`UPDATE Juntada SET destino=@destino, deposito_id=@deposito_id WHERE id=@id`);

    for (const d of destinos) {
      if (!d.kilos || parseFloat(d.kilos) <= 0) continue;

      const now2 = new Date();
      const uid2 = req.user ? req.user.id : null;

      if (d.tipo === 'deposito') {
        await new sql.Request(transaction)
          .input('deposito_id',  sql.Int,           d.deposito_id)
          .input('temporada_id', sql.Int,           temporada_id)
          .input('lote_id',      sql.Int,           lote_id)
          .input('tipo',         sql.NVarChar,      'ingreso')
          .input('kilos',        sql.Decimal(10,2), d.kilos)
          .input('fecha',        sql.DateTime,      now2)
          .input('observacion',  sql.NVarChar,      `Juntada #${juntadaId}`)
          .input('juntada_id',   sql.Int,           juntadaId)
          .input('juntador_id',  sql.Int,           juntada.juntador_id)
          .input('usuario_id',   sql.Int,           uid2)
          .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, lote_id, tipo, kilos, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@deposito_id, @temporada_id, @lote_id, @tipo, @kilos, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

        await new sql.Request(transaction)
          .input('temporada_id', sql.Int,           temporada_id)
          .input('lote_id',      sql.Int,           lote_id)
          .input('kilos',        sql.Decimal(10,2), d.kilos)
          .input('fecha',        sql.DateTime,      now2)
          .input('observacion',  sql.NVarChar,      `Juntada #${juntadaId}`)
          .input('juntada_id',   sql.Int,           juntadaId)
          .input('juntador_id',  sql.Int,           juntada.juntador_id)
          .input('usuario_id',   sql.Int,           uid2)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, lote_id, tipo, kilos, destino, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@temporada_id, @lote_id, 'ingreso', @kilos, 'deposito', @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);

      } else if (d.tipo === 'descarte') {
        await new sql.Request(transaction)
          .input('temporada_id', sql.Int,           temporada_id)
          .input('lote_id',      sql.Int,           lote_id)
          .input('kilos',        sql.Decimal(10,2), d.kilos)
          .input('fecha',        sql.DateTime,      now2)
          .input('observacion',  sql.NVarChar,      `Descarte juntada #${juntadaId}: ${d.motivo || ''}`)
          .input('juntada_id',   sql.Int,           juntadaId)
          .input('juntador_id',  sql.Int,           juntada.juntador_id)
          .input('usuario_id',   sql.Int,           uid2)
          .query(`INSERT INTO StockMercaderia
                  (temporada_id, lote_id, tipo, kilos, destino, precio_kilo, fecha, observacion, juntada_id, juntador_id, usuario_id)
                  VALUES (@temporada_id, @lote_id, 'egreso_descarte', @kilos, 'descarte', 0, @fecha, @observacion, @juntada_id, @juntador_id, @usuario_id)`);
      }
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Obtener juntadas del día
router.get('/hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT j.id, l.nombre AS lote,
              ju.apellido + ', ' + ju.nombre AS juntador,
              j.kilos, j.fecha_hora,
              j.destino, j.deposito_id, d.nombre AS deposito_nombre,
              j.precio_venta_directa, j.comprador_directo
              FROM Juntada j
              JOIN Lotes l ON j.lote_id = l.id
              JOIN Juntadores ju ON j.juntador_id = ju.id
              LEFT JOIN Depositos d ON j.deposito_id = d.id
              WHERE CAST(j.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY j.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
