const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');
// ── Resumen general por temporada (antes que /:id para evitar conflicto de ruta)
router.get('/resumen', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "ISNULL(estado, '') != 'anulada'";
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where += ' AND temporada_id = @temporada_id';
    }
    const result = await dbReq.query(`
      SELECT
        ISNULL(SUM(CASE WHEN tipo = 'ingreso' THEN kilos WHEN tipo = 'egreso_anulacion' THEN -kilos ELSE 0 END), 0) AS kilos_ingresados,
        ISNULL(SUM(CASE WHEN tipo = 'egreso_venta' THEN kilos WHEN tipo = 'ingreso_anulacion' THEN -kilos ELSE 0 END), 0) AS kilos_vendidos,
        ISNULL(SUM(CASE WHEN tipo = 'egreso_descarte' THEN kilos ELSE 0 END), 0) AS kilos_descartados,
        ISNULL(SUM(CASE WHEN tipo = 'ingreso' THEN kilos WHEN tipo = 'egreso_anulacion' THEN -kilos ELSE 0 END), 0) -
        ISNULL(SUM(CASE WHEN tipo = 'egreso_venta' THEN kilos WHEN tipo = 'ingreso_anulacion' THEN -kilos ELSE 0 END), 0) -
        ISNULL(SUM(CASE WHEN tipo = 'egreso_descarte' THEN kilos ELSE 0 END), 0) AS kilos_en_deposito,
        ISNULL(SUM(CASE WHEN tipo = 'egreso_venta' THEN kilos * ISNULL(precio_kilo, 0)
                        WHEN tipo = 'ingreso_anulacion' THEN -kilos * ISNULL(precio_kilo, 0)
                        ELSE 0 END), 0) AS ingresos_venta
      FROM MovimientosDeposito
      WHERE ${where}`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Lista todos los depósitos con stock actual ──────────────────
router.get('/', async (req, res) => {
  try {
    const { tipo_stock } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'd.activo = 1';
    if (tipo_stock === 'insumos') {
      where += ` AND d.tipo_deposito = 'insumos'`;
    } else if (tipo_stock === 'mercaderia') {
      where += ` AND d.tipo_deposito IN ('fruta_fresca','camara_frio')`;
    }
    const result = await dbReq.query(`
      SELECT d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg, d.costo_kg_dia,
             d.ubicacion, d.observacion, d.activo,
             ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'         THEN m.kilos ELSE 0 END), 0) -
             ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' AND m.tipo != 'egreso_anulacion' THEN m.kilos ELSE 0 END), 0) AS stock_actual,
             ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'         THEN m.kilos ELSE 0 END), 0) AS total_ingresado,
             ISNULL(SUM(CASE WHEN m.tipo = 'egreso_venta'    THEN m.kilos ELSE 0 END), 0) AS total_vendido,
             ISNULL(SUM(CASE WHEN m.tipo = 'egreso_descarte' THEN m.kilos ELSE 0 END), 0) AS total_descartado
      FROM Depositos d
      LEFT JOIN MovimientosDeposito m ON d.id = m.deposito_id
      WHERE ${where}
      GROUP BY d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg, d.costo_kg_dia,
               d.ubicacion, d.observacion, d.activo
      ORDER BY d.nombre`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Crear depósito ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { nombre, tipo, tipo_deposito, capacidad_kg, costo_kg_dia, ubicacion, observacion } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
    const tiposDepValidos = ['fruta_fresca', 'camara_frio', 'insumos'];
    const tipoDepVal = tiposDepValidos.includes(tipo_deposito) ? tipo_deposito : 'fruta_fresca';
    const pool = await getPool();
    const result = await pool.request()
      .input('nombre',         sql.NVarChar,       nombre)
      .input('tipo',           sql.NVarChar,       tipo)
      .input('tipo_deposito',  sql.NVarChar,       tipoDepVal)
      .input('capacidad_kg',   sql.Decimal(12, 2), capacidad_kg || null)
      .input('costo_kg_dia',   sql.Decimal(10, 4), costo_kg_dia || null)
      .input('ubicacion',      sql.NVarChar,       ubicacion    || '')
      .input('observacion',    sql.NVarChar,       observacion  || '')
      .query(`INSERT INTO Depositos (nombre, tipo, tipo_deposito, capacidad_kg, costo_kg_dia, ubicacion, observacion)
              OUTPUT INSERTED.id
              VALUES (@nombre, @tipo, @tipo_deposito, @capacidad_kg, @costo_kg_dia, @ubicacion, @observacion)`);
    res.json({ ok: true, id: result.recordset[0].id });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Editar depósito ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { nombre, tipo, tipo_deposito, capacidad_kg, costo_kg_dia, ubicacion, observacion, activo } = req.body;
    const tiposDepValidos = ['fruta_fresca', 'camara_frio', 'insumos'];
    const tipoDepVal = tiposDepValidos.includes(tipo_deposito) ? tipo_deposito : 'fruta_fresca';
    const pool = await getPool();
    await pool.request()
      .input('id',            sql.Int,            req.params.id)
      .input('nombre',        sql.NVarChar,       nombre)
      .input('tipo',          sql.NVarChar,       tipo)
      .input('tipo_deposito', sql.NVarChar,       tipoDepVal)
      .input('capacidad_kg',  sql.Decimal(12, 2), capacidad_kg || null)
      .input('costo_kg_dia',  sql.Decimal(10, 4), costo_kg_dia || null)
      .input('ubicacion',     sql.NVarChar,       ubicacion    || '')
      .input('observacion',   sql.NVarChar,       observacion  || '')
      .input('activo',        sql.Bit,            activo !== undefined ? (activo ? 1 : 0) : 1)
      .query(`UPDATE Depositos SET nombre=@nombre, tipo=@tipo, tipo_deposito=@tipo_deposito,
              capacidad_kg=@capacidad_kg, costo_kg_dia=@costo_kg_dia, ubicacion=@ubicacion,
              observacion=@observacion, activo=@activo WHERE id=@id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Stock de un depósito ────────────────────────────────────────
router.get('/:id/stock', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN tipo = 'ingreso'         THEN kilos ELSE 0 END), 0) AS ingresado,
          ISNULL(SUM(CASE WHEN tipo = 'egreso_venta'    THEN kilos ELSE 0 END), 0) AS vendido,
          ISNULL(SUM(CASE WHEN tipo = 'egreso_descarte' THEN kilos ELSE 0 END), 0) AS descartado,
          ISNULL(SUM(CASE WHEN tipo = 'ingreso'         THEN kilos ELSE 0 END), 0) -
          ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%' AND tipo != 'egreso_anulacion' THEN kilos ELSE 0 END), 0) AS stock_actual
        FROM MovimientosDeposito WHERE deposito_id = @id`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Historial de movimientos de un depósito ─────────────────────
router.get('/:id/movimientos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT m.id, m.tipo, m.kilos, m.precio_kilo, m.comprador,
               m.destino_venta, m.fecha, m.observacion,
               l.nombre AS parcela, t.nombre AS temporada
        FROM MovimientosDeposito m
        LEFT JOIN Parcelas      l ON m.parcela_id      = l.id
        LEFT JOIN Temporadas t ON m.temporada_id = t.id
        WHERE m.deposito_id = @id
        ORDER BY m.fecha DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Registrar ingreso al depósito ───────────────────────────────
router.post('/ingreso', async (req, res) => {
  const { deposito_id, temporada_id, parcela_id, kilos, fecha, observacion } = req.body;
  if (!deposito_id || !temporada_id || !kilos) {
    return res.status(400).json({ error: 'Depósito, temporada y kilos son obligatorios' });
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const fechaDate = fecha ? new Date(fecha) : new Date();

    // 1. MovimientosDeposito
    await new sql.Request(transaction)
      .input('deposito_id',  sql.Int,           deposito_id)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('parcela_id',      sql.Int,           parcela_id || null)
      .input('kilos',        sql.Decimal(10,2), kilos)
      .input('fecha',        sql.DateTime,      fechaDate)
      .input('observacion',  sql.NVarChar,      observacion || '')
      .query(`INSERT INTO MovimientosDeposito
              (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion)
              VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso', @kilos, @fecha, @observacion)`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});


// ── Stock disponible por depósito, desglosado por variedad + parcela ──
router.get('/stock-disponible', async (req, res) => {
  try {
    const { deposito_id, temporada_id } = req.query;
    if (!deposito_id) return res.status(400).json({ error: 'deposito_id requerido' });
    const pool = await getPool();
    const dbReq = pool.request().input('did', sql.Int, parseInt(deposito_id));
    let where = 'm.deposito_id = @did';
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where += ' AND m.temporada_id = @temporada_id';
    }
    const result = await dbReq.query(`
      SELECT
        l.id   AS parcela_id,
        l.nombre AS parcela,
        ISNULL(l.variedad, 'Sin variedad') AS variedad,
        ISNULL(SUM(CASE WHEN m.tipo='ingreso'      THEN m.kilos ELSE 0 END),0) -
        ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' AND m.tipo != 'egreso_anulacion' THEN m.kilos ELSE 0 END),0) AS kg_disponibles
      FROM MovimientosDeposito m
      JOIN Parcelas l ON m.parcela_id = l.id
      WHERE ${where}
      GROUP BY l.id, l.nombre, l.variedad
      HAVING
        ISNULL(SUM(CASE WHEN m.tipo='ingreso'      THEN m.kilos ELSE 0 END),0) -
        ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' AND m.tipo != 'egreso_anulacion' THEN m.kilos ELSE 0 END),0) > 0
      ORDER BY variedad, parcela`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Registrar descarte de depósito ──────────────────────────────
router.post('/descarte', async (req, res) => {
  const { deposito_id, temporada_id, kilos, fecha, observacion } = req.body;
  if (!deposito_id || !temporada_id || !kilos)
    return res.status(400).json({ error: 'Depósito, temporada y kilos son obligatorios' });
  const pool = await getPool();
  const stockRes = await pool.request()
    .input('did', sql.Int, deposito_id)
    .query(`SELECT ISNULL(SUM(CASE WHEN tipo='ingreso' THEN kilos ELSE 0 END),0) -
                   ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%' AND tipo != 'egreso_anulacion' THEN kilos ELSE 0 END),0) AS disponible
            FROM MovimientosDeposito WHERE deposito_id = @did`);
  const disponible = parseFloat(stockRes.recordset[0].disponible);
  if (disponible < parseFloat(kilos))
    return res.status(400).json({ error: `Stock insuficiente. Disponible: ${disponible.toFixed(2)} kg` });
  try {
    await pool.request()
      .input('deposito_id',  sql.Int,           deposito_id)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('tipo',         sql.NVarChar,      'egreso_descarte')
      .input('kilos',        sql.Decimal(10,2), parseFloat(kilos))
      .input('fecha',        sql.DateTime,      fecha ? new Date(fecha) : new Date())
      .input('observacion',  sql.NVarChar,      observacion || '')
      .input('usuario_id',   sql.Int,           req.user ? req.user.id : null)
      .query(`INSERT INTO MovimientosDeposito (deposito_id, temporada_id, tipo, kilos, fecha, observacion, usuario_id)
              VALUES (@deposito_id, @temporada_id, @tipo, @kilos, @fecha, @observacion, @usuario_id)`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Ocupación de almacenes ──────────────────────────────────────
router.get('/ocupacion', async (req, res) => {
  try {
    const { tipo_stock, tipo_deposito } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'd.activo = 1';
    if (tipo_deposito) {
      // Soporte para lista separada por comas: tipo_deposito=fruta_fresca,camara_frio
      const tiposArr = tipo_deposito.split(',').map(t => t.trim());
      const tiposPlaceholders = tiposArr.map((t, i) => { dbReq.input(`tipo_dep_${i}`, sql.NVarChar, t); return `@tipo_dep_${i}`; });
      where += ` AND d.tipo_deposito IN (${tiposPlaceholders.join(',')})`;
    } else if (tipo_stock === 'insumos') {
      where += ` AND d.tipo_deposito = 'insumos'`;
    } else if (tipo_stock === 'mercaderia') {
      where += ` AND d.tipo_deposito IN ('fruta_fresca','camara_frio')`;
    }

    if (tipo_stock === 'insumos') {
      // Ocupación desde StockInsumos (por deposito_id)
      const result = await dbReq.query(`
        SELECT d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg,
               ISNULL(SUM(CASE
                 WHEN si.tipo IN ('compra','ingreso_manual') THEN si.cantidad
                 WHEN si.tipo IN ('egreso','aplicacion','merma','vencimiento','perdida') THEN -si.cantidad
                 ELSE 0 END), 0) AS ocupado_kg
        FROM Depositos d
        LEFT JOIN StockInsumos si ON si.deposito_id = d.id
        WHERE ${where}
        GROUP BY d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg
        ORDER BY d.nombre`);
      res.json(result.recordset.map(function(r) {
        const ocup = Math.max(0, parseFloat(r.ocupado_kg) || 0);
        const cap  = parseFloat(r.capacidad_kg) || 0;
        return Object.assign({}, r, {
          ocupado_kg: ocup,
          porcentaje: cap > 0 ? Math.min(100, (ocup / cap) * 100) : null
        });
      }));
    } else {
      // Ocupación desde MovimientosDeposito (fruta fresca y cámara fría)
      const result = await dbReq.query(`
        SELECT d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg,
               ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'    THEN m.kilos ELSE 0 END), 0) -
               ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' AND m.tipo != 'egreso_anulacion' THEN m.kilos ELSE 0 END), 0) AS ocupado_kg
        FROM Depositos d
        LEFT JOIN MovimientosDeposito m ON m.deposito_id = d.id
        WHERE ${where}
        GROUP BY d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg
        ORDER BY d.nombre`);
      res.json(result.recordset.map(function(r) {
        const ocup = Math.max(0, parseFloat(r.ocupado_kg) || 0);
        const cap  = parseFloat(r.capacidad_kg) || 0;
        return Object.assign({}, r, {
          ocupado_kg: ocup,
          porcentaje: cap > 0 ? Math.min(100, (ocup / cap) * 100) : null
        });
      }));
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
