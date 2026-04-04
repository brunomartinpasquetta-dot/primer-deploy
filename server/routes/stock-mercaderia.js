const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Resumen de stock de mercaderia por temporada
router.get('/', async (req, res) => {
  try {
    const temporada_id = req.query.temporada_id;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT l.nombre AS parcela,
                 sm.destino,
                 SUM(CASE WHEN sm.tipo = 'ingreso'       THEN sm.kilos ELSE 0 END) AS kilos_ingresados,
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%'   THEN sm.kilos ELSE 0 END) AS kilos_egresados,
                 SUM(CASE WHEN sm.tipo = 'ingreso'       THEN sm.kilos ELSE 0 END) -
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%'   THEN sm.kilos ELSE 0 END) AS stock_actual,
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%'   THEN sm.kilos * sm.precio_kilo ELSE 0 END) AS total_vendido
                 FROM StockMercaderia sm
                 JOIN Parcelas l ON sm.parcela_id = l.id`;
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

// LEGACY - deprecar en próxima versión
// Ingreso real se hace vía POST /api/depositos/ingreso (que sí usa transacción + MovimientosDeposito)
// Ningún frontend consume esta ruta — verificado 2026-04-03
router.post('/ingreso', async (req, res) => {
  console.warn('[DEPRECADO] POST /api/stock-mercaderia/ingreso llamado — usar /api/depositos/ingreso en su lugar');
  try {
    const { temporada_id, parcela_id, kilos, destino, observacion } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('temporada_id', sql.Int, temporada_id)
      .input('parcela_id', sql.Int, parcela_id)
      .input('kilos', sql.Decimal(10,2), kilos)
      .input('destino', sql.NVarChar, destino || 'fresco')
      .input('observacion', sql.NVarChar, observacion || '')
      .query(`INSERT INTO StockMercaderia (temporada_id, parcela_id, tipo, kilos, destino, observacion)
              VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, @destino, @observacion)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar egreso / venta de mercaderia
router.post('/egreso', async (req, res) => {
  const { temporada_id, parcela_id, kilos, destino, precio_kilo,
          comprador, cliente_id, forma_pago_id, observacion } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const kilosNum  = parseFloat(kilos);
    const precioNum = precio_kilo ? parseFloat(precio_kilo) : null;
    const total     = (precioNum && precioNum > 0) ? kilosNum * precioNum : 0;
    const uid       = req.user ? req.user.id : null;

    // Determinar si la forma de pago es Cuenta Corriente
    let esCuentaCorriente = false;
    if (forma_pago_id) {
      const fpRes = await new sql.Request(transaction)
        .input('id', sql.Int, forma_pago_id)
        .query('SELECT es_cuenta_corriente FROM FormasPago WHERE id = @id');
      esCuentaCorriente = !!(fpRes.recordset[0]?.es_cuenta_corriente);
    }

    // Nombre del comprador para concepto
    let compradorNombre = comprador || '';
    if (cliente_id && !compradorNombre) {
      const cliRes = await new sql.Request(transaction)
        .input('id', sql.Int, cliente_id)
        .query('SELECT nombre FROM Clientes WHERE id = @id');
      compradorNombre = cliRes.recordset[0]?.nombre || '';
    }

    // 1. StockMercaderia — egreso
    const smResult = await new sql.Request(transaction)
      .input('temporada_id',  sql.Int,           temporada_id)
      .input('parcela_id',       sql.Int,           parcela_id)
      .input('kilos',         sql.Decimal(10,2), kilosNum)
      .input('destino',       sql.NVarChar,      destino || 'fresco')
      .input('precio_kilo',   sql.Decimal(10,2), precioNum)
      .input('comprador',     sql.NVarChar,      compradorNombre)
      .input('cliente_id',    sql.Int,           cliente_id || null)
      .input('forma_pago_id', sql.Int,           forma_pago_id || null)
      .input('usuario_id',    sql.Int,           uid)
      .input('observacion',   sql.NVarChar,      observacion || '')
      .query(`INSERT INTO StockMercaderia
                (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo,
                 comprador, cliente_id, forma_pago_id, usuario_id, observacion)
              OUTPUT INSERTED.id
              VALUES (@temporada_id, @parcela_id, 'egreso_venta', @kilos, @destino, @precio_kilo,
                      @comprador, @cliente_id, @forma_pago_id, @usuario_id, @observacion)`);
    const sm_id = smResult.recordset[0].id;

    if (total > 0) {
      if (esCuentaCorriente && cliente_id) {
        // 2a. Cuenta Corriente: débito en CuentaCorrienteClientes (se cobra después)
        await new sql.Request(transaction)
          .input('cliente_id',          sql.Int,           cliente_id)
          .input('monto',               sql.Decimal(12,2), total)
          .input('forma_pago_id',       sql.Int,           forma_pago_id)
          .input('temporada_id',        sql.Int,           temporada_id || null)
          .input('stock_mercaderia_id', sql.Int,           sm_id)
          .input('observacion',         sql.NVarChar,      `Venta ${kilosNum} kg${observacion ? ' - ' + observacion : ''}`)
          .query(`INSERT INTO CuentaCorrienteClientes
                    (cliente_id, tipo, monto, forma_pago_id, temporada_id,
                     stock_mercaderia_id, observacion, fecha_hora)
                  VALUES (@cliente_id, 'debito', @monto, @forma_pago_id, @temporada_id,
                          @stock_mercaderia_id, @observacion, GETDATE())`);
      } else {
        // 2b. Pago contado: ingreso directo en Caja
        await new sql.Request(transaction)
          .input('concepto',        sql.NVarChar,      `Venta mercadería${compradorNombre ? ' a ' + compradorNombre : ''}`)
          .input('monto',           sql.Decimal(12,2), total)
          .input('forma_pago_id',   sql.Int,           forma_pago_id || null)
          .input('temporada_id',    sql.Int,           temporada_id || null)
          .input('observacion',     sql.NVarChar,      observacion || '')
          .input('usuario_nombre',  sql.NVarChar,      req.user ? req.user.nombre : null)
          .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id, observacion, usuario_nombre)
                  VALUES ('ingreso', @concepto, @monto, @forma_pago_id, @temporada_id, @observacion, @usuario_nombre)`);
      }
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// Stock actual basado en LotesMercaderia (lotes y sub-lotes en depósitos)
router.get('/actual', async (req, res) => {
  try {
    let { temporada_id } = req.query;
    const pool = await getPool();

    // Si no viene temporada_id, usar la activa
    if (!temporada_id) {
      const tRes = await pool.request()
        .query(`SELECT TOP 1 id FROM Temporadas WHERE activa = 1`);
      if (tRes.recordset.length) temporada_id = tRes.recordset[0].id;
    }
    if (!temporada_id) return res.json([]);

    const result = await pool.request()
      .input('temporada_id', sql.Int, parseInt(temporada_id))
      .query(`
        SELECT
          lm.etapa,
          ISNULL(p.variedad, p.nombre) AS variedad,
          d.nombre   AS deposito,
          d.tipo     AS deposito_tipo,
          cc.nombre  AS categoria,
          sc.nombre  AS sub_categoria,
          COUNT(*)   AS cantidad_lotes,
          SUM(lm.kilos) AS kg_disponibles
        FROM LotesMercaderia lm
        LEFT JOIN Parcelas p                    ON lm.parcela_id          = p.id
        LEFT JOIN Depositos d                   ON lm.deposito_actual_id  = d.id
        LEFT JOIN CategoriasClasificacion cc     ON lm.categoria_clasif_id = cc.id
        LEFT JOIN SubCategoriasClasificacion sc  ON lm.sub_categoria_id    = sc.id
        WHERE lm.temporada_id = @temporada_id
          AND lm.estado != 'anulada'
          AND lm.etapa NOT IN ('vendido')
          AND lm.kilos > 0
        GROUP BY lm.etapa, ISNULL(p.variedad, p.nombre), d.nombre, d.tipo, cc.nombre, sc.nombre
        ORDER BY d.nombre, lm.etapa, cc.nombre
      `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// KPIs de kg: cosechados (Juntada) + por etapa (LotesMercaderia)
router.get('/kpis', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();

    // KG cosechados desde Juntada
    const dbJ = pool.request();
    let qJuntada = `SELECT ISNULL(SUM(j.kilos), 0) AS kg_cosechados
                    FROM Juntada j JOIN Parcelas l ON j.parcela_id = l.id`;
    if (temporada_id) {
      qJuntada += ' WHERE l.temporada_id = @temporada_id';
      dbJ.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    const jRes = await dbJ.query(qJuntada);

    // KG por etapa desde LotesMercaderia
    const dbLm = pool.request();
    let wLm = "estado != 'anulada'";
    if (temporada_id) {
      wLm += ' AND temporada_id = @tid';
      dbLm.input('tid', sql.Int, parseInt(temporada_id));
    }
    const lmRes = await dbLm.query(`
      SELECT
        ISNULL(SUM(CASE WHEN etapa IN ('cosecha','despalillado','en_clasificacion','clasificado') THEN kilos ELSE 0 END), 0) AS kg_en_proceso,
        ISNULL(SUM(CASE WHEN etapa IN ('embalado','vendido_parcial') AND lote_padre_id IS NOT NULL THEN kilos ELSE 0 END), 0) AS kg_embalado,
        ISNULL(SUM(CASE WHEN etapa IN ('vendido') THEN kilos ELSE 0 END), 0) AS kg_vendidos,
        ISNULL(SUM(CASE WHEN etapa = 'descartado' THEN kilos ELSE 0 END), 0) AS kg_descartados
      FROM LotesMercaderia
      WHERE ${wLm}`);

    const lm = lmRes.recordset[0];
    res.json({
      kg_cosechados:  parseFloat(jRes.recordset[0].kg_cosechados),
      kg_en_proceso:  parseFloat(lm.kg_en_proceso),
      kg_embalado:    parseFloat(lm.kg_embalado),
      kg_en_deposito: parseFloat(lm.kg_en_proceso) + parseFloat(lm.kg_embalado),
      kg_vendidos:    parseFloat(lm.kg_vendidos),
      kg_descartados: parseFloat(lm.kg_descartados)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de movimientos: MovimientosDeposito + ventas directas de StockMercaderia
router.get('/historial', async (req, res) => {
  try {
    const { temporada_id, desde, hasta, parcela_id, tipo } = req.query;
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
    if (parcela_id) {
      dbReq.input('parcela_id', sql.Int, parseInt(parcela_id));
      wMov += ' AND m.parcela_id = @parcela_id';
      wSm  += ' AND sm.parcela_id = @parcela_id';
    }

    // Filtro de tipo
    let tipoFiltroMov = '';
    let incluirSm = true;
    if (tipo === 'ingreso') {
      tipoFiltroMov = " AND m.tipo = 'ingreso'";
      incluirSm = false; // ventas directas son egresos
    } else if (tipo === 'egreso') {
      tipoFiltroMov = " AND m.tipo LIKE 'egreso%'";
    } else if (tipo === 'egreso_venta') {
      tipoFiltroMov = " AND m.tipo = 'egreso_venta'";
    } else if (tipo === 'egreso_descarte') {
      tipoFiltroMov = " AND m.tipo = 'egreso_descarte'";
      incluirSm = false;
    }

    const smUnion = incluirSm ? `
      UNION ALL
      SELECT
        sm.id,
        NULL                        AS movimiento_id,
        'egreso_venta'              AS tipo,
        sm.kilos,
        sm.precio_kilo,
        CASE WHEN sm.precio_kilo IS NOT NULL THEN sm.kilos * sm.precio_kilo ELSE NULL END AS total,
        sm.comprador,
        'venta_directa'             AS destino_venta,
        sm.observacion,
        sm.fecha,
        NULL                        AS variedad,
        NULL                        AS cliente_id,
        'cobrada'                   AS estado_cobro,
        sm.estado,
        NULL                        AS numero_remito,
        fp2.nombre                  AS forma_pago,
        NULL                        AS deposito,
        sm.parcela_id,
        l2.nombre                   AS parcela,
        t2.nombre                   AS temporada,
        ju2.apellido + ', ' + ju2.nombre AS cosechero,
        sm.juntada_id,
        COALESCE(sm.juntador_id, jref2.juntador_id) AS juntador_id,
        sm.usuario_id,
        u2.nombre                   AS usuario
      FROM StockMercaderia sm
      LEFT JOIN Parcelas    l2    ON sm.parcela_id      = l2.id
      LEFT JOIN Temporadas  t2    ON sm.temporada_id    = t2.id
      LEFT JOIN FormasPago  fp2   ON sm.forma_pago_id   = fp2.id
      LEFT JOIN Juntada     jref2 ON sm.juntada_id   = jref2.id AND sm.juntador_id IS NULL
      LEFT JOIN Juntadores  ju2   ON COALESCE(sm.juntador_id, jref2.juntador_id) = ju2.id
      LEFT JOIN Usuarios    u2    ON sm.usuario_id   = u2.id
      WHERE ${wSm}` : '';

    const query = `
      SELECT m.id, m.id AS movimiento_id, m.tipo, m.kilos, m.precio_kilo,
             CASE WHEN m.precio_kilo IS NOT NULL THEN m.kilos * m.precio_kilo ELSE NULL END AS total,
             m.comprador, m.destino_venta, m.observacion, m.fecha,
             m.variedad,
             m.cliente_id,
             m.estado_cobro,
             m.estado,
             m.numero_remito,
             fp.nombre AS forma_pago,
             d.nombre  AS deposito,
             m.parcela_id,
             l.nombre AS parcela,
             t.nombre  AS temporada,
             ju.apellido + ', ' + ju.nombre AS cosechero,
             m.juntada_id,
             COALESCE(m.juntador_id, jref.juntador_id) AS juntador_id,
             m.usuario_id,
             u.nombre  AS usuario
      FROM MovimientosDeposito m
      LEFT JOIN Depositos   d    ON m.deposito_id   = d.id
      LEFT JOIN Parcelas    l    ON m.parcela_id     = l.id
      LEFT JOIN Temporadas  t    ON m.temporada_id   = t.id
      LEFT JOIN FormasPago  fp   ON m.forma_pago_id  = fp.id
      LEFT JOIN Juntada    jref ON m.juntada_id   = jref.id AND m.juntador_id IS NULL
      LEFT JOIN Juntadores ju   ON COALESCE(m.juntador_id, jref.juntador_id) = ju.id
      LEFT JOIN Usuarios   u    ON m.usuario_id   = u.id
      WHERE ${wMov}${tipoFiltroMov}
      ${smUnion}
      ORDER BY fecha DESC`;

    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Etapa actual de cada juntada
// Lógica:
//   stock_pendiente=1                              → 'pendiente_despalillado'
//   stock_pendiente=0 + sin Despalillado           → 'fresco'
//   stock_pendiente=0 + con Despalillado           → 'despalillado'
//   kilos_egresados >= kilos_ingresados (y > 0)   → 'vendida'
//   kilos_egresados > 0 pero < kilos_ingresados   → 'vendida_parcial'
router.get('/etapas', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id) {
      where += ' AND l.temporada_id = @temporada_id';
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    const result = await dbReq.query(`
      SELECT
        j.id          AS juntada_id,
        j.kilos       AS kilos_juntada,
        j.stock_pendiente,
        j.deposito_id,
        j.destino,
        l.nombre AS parcela,
        l.variedad,
        ju.nombre + ' ' + ju.apellido AS juntador,
        j.fecha_hora,
        d.nombre      AS deposito_nombre,
        d.tipo        AS deposito_tipo,
        d.requiere_despalillado,
        ISNULL(desp.kilos, 0)      AS kilos_despalillados,
        CASE WHEN desp.id IS NOT NULL THEN 1 ELSE 0 END AS tiene_despalillado,
        ISNULL(sm_ing.total_kg, 0)  AS kilos_en_stock,
        ISNULL(sm_egr.total_kg, 0)  AS kilos_vendidos,
        CASE
          WHEN j.stock_pendiente = 1
            THEN 'pendiente_despalillado'
          WHEN ISNULL(sm_ing.total_kg,0) > 0
           AND ISNULL(sm_egr.total_kg,0) >= ISNULL(sm_ing.total_kg,0)
            THEN 'vendida'
          WHEN ISNULL(sm_egr.total_kg,0) > 0
            THEN 'vendida_parcial'
          WHEN desp.id IS NOT NULL
            THEN 'despalillado'
          ELSE 'fresco'
        END AS etapa
      FROM Juntada j
      JOIN Parcelas l       ON j.parcela_id     = l.id
      JOIN Juntadores ju ON j.juntador_id = ju.id
      LEFT JOIN Depositos d    ON j.deposito_id = d.id
      LEFT JOIN Despalillado desp ON desp.juntada_id = j.id
      LEFT JOIN (
        SELECT juntada_id, SUM(kilos) AS total_kg
        FROM StockMercaderia WHERE tipo = 'ingreso'
        GROUP BY juntada_id
      ) sm_ing ON sm_ing.juntada_id = j.id
      LEFT JOIN (
        SELECT juntada_id, SUM(kilos) AS total_kg
        FROM StockMercaderia WHERE tipo LIKE 'egreso%'
        GROUP BY juntada_id
      ) sm_egr ON sm_egr.juntada_id = j.id
      WHERE ${where}
        AND j.destino NOT IN ('venta_directa','descarte')
      ORDER BY j.fecha_hora DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /historial/:id — editar movimiento de venta
router.patch('/historial/:id', async (req, res) => {
  try {
    const { observacion, numero_remito, fecha, forma_pago_id, precio_kilo, comprador, estado_cobro } = req.body;
    const pool = await getPool();
    const r = pool.request().input('id', sql.Int, req.params.id);
    const sets = [];
    if (observacion !== undefined)   { sets.push('observacion = @obs');       r.input('obs',   sql.NVarChar,     observacion || ''); }
    if (numero_remito !== undefined) { sets.push('numero_remito = @rem');     r.input('rem',   sql.NVarChar,     numero_remito || null); }
    if (fecha !== undefined)         { sets.push('fecha = @fecha');           r.input('fecha', sql.DateTime,     new Date(fecha)); }
    if (forma_pago_id !== undefined) { sets.push('forma_pago_id = @fpid');   r.input('fpid',  sql.Int,          forma_pago_id || null); }
    if (precio_kilo !== undefined)   { sets.push('precio_kilo = @pk');       r.input('pk',    sql.Decimal(10,2),parseFloat(precio_kilo) || 0); }
    if (comprador !== undefined)     { sets.push('comprador = @comp');       r.input('comp',  sql.NVarChar,     comprador || null); }
    if (estado_cobro !== undefined)  { sets.push('estado_cobro = @ec');      r.input('ec',    sql.NVarChar,     estado_cobro || null); }
    if (!sets.length) return res.json({ ok: true });
    await r.query('UPDATE MovimientosDeposito SET ' + sets.join(', ') + ' WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auditoria — historial de auditoría de ventas
router.get('/auditoria', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT TOP 100 * FROM AuditoriaVentas ORDER BY fecha_hora DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /historial/:id/anular — anular venta (MovimientosDeposito)
router.post('/historial/:id/anular', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const movId = parseInt(req.params.id);
    const uid = req.user ? req.user.id : null;
    const uname = req.user ? req.user.nombre : null;
    const motivo = req.body.motivo || 'Anulación manual';

    // Verificar que existe y es una venta confirmada
    const mov = await new sql.Request(transaction)
      .input('id', sql.Int, movId)
      .query('SELECT id, tipo, kilos, precio_kilo, cliente_id, forma_pago_id, temporada_id, estado FROM MovimientosDeposito WHERE id = @id');
    if (!mov.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Movimiento no encontrado' }); }
    const m = mov.recordset[0];
    if (m.estado === 'anulada') { await transaction.rollback(); return res.status(400).json({ error: 'Ya está anulado' }); }

    const total = parseFloat(m.kilos) * (parseFloat(m.precio_kilo) || 0);

    // 1. Revertir Caja (insertar egreso para compensar el ingreso original)
    if (total > 0) {
      // Verificar si fue CC o caja
      const ccExists = await new sql.Request(transaction)
        .input('sm_id', sql.Int, movId)
        .query('SELECT id FROM CuentaCorrienteClientes WHERE stock_mercaderia_id = @sm_id');

      if (ccExists.recordset.length > 0) {
        await new sql.Request(transaction)
          .input('cliente_id', sql.Int, m.cliente_id)
          .input('monto', sql.Decimal(12,2), total)
          .input('sm_id', sql.Int, movId)
          .query(`INSERT INTO CuentaCorrienteClientes (cliente_id, tipo, monto, stock_mercaderia_id, observacion, fecha_hora)
                  VALUES (@cliente_id, 'credito', @monto, @sm_id, 'Anulación venta #' + CAST(@sm_id AS VARCHAR), GETDATE())`);
      } else {
        await new sql.Request(transaction)
          .input('monto', sql.Decimal(12,2), total)
          .input('mov_id', sql.Int, movId)
          .input('uname', sql.NVarChar, uname)
          .query(`INSERT INTO Caja (tipo, concepto, monto, usuario_nombre)
                  VALUES ('egreso', 'Anulación venta #' + CAST(@mov_id AS VARCHAR), @monto, @uname)`);
      }
    }

    // 2. Marcar como anulada
    await new sql.Request(transaction)
      .input('id', sql.Int, movId)
      .query("UPDATE MovimientosDeposito SET estado = 'anulada' WHERE id = @id");

    // 3. Auditoría
    await new sql.Request(transaction)
      .input('movimiento_id', sql.Int, movId)
      .input('usuario_id', sql.Int, uid)
      .input('usuario_nombre', sql.NVarChar, uname)
      .input('motivo', sql.NVarChar, motivo)
      .query(`INSERT INTO AuditoriaVentas (movimiento_id, tabla_origen, accion, campo, valor_anterior, valor_nuevo, usuario_id, usuario_nombre, fecha_hora)
              VALUES (@movimiento_id, 'MovimientosDeposito', 'anulacion', 'estado', 'confirmada', 'anulada — ' + @motivo, @usuario_id, @usuario_nombre, GETDATE())`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

// PATCH /historial/:id — editar venta con auditoría
router.patch('/historial/:id/auditado', async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const movId = parseInt(req.params.id);
    const uid = req.user ? req.user.id : null;
    const uname = req.user ? req.user.nombre : null;
    const { observacion, numero_remito, fecha, forma_pago_id, precio_kilo, comprador, estado_cobro } = req.body;

    const prev = await new sql.Request(transaction)
      .input('id', sql.Int, movId)
      .query('SELECT observacion, numero_remito, fecha, forma_pago_id, precio_kilo, comprador, estado_cobro FROM MovimientosDeposito WHERE id = @id');
    if (!prev.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'No encontrado' }); }
    const old = prev.recordset[0];

    const r = new sql.Request(transaction).input('id', sql.Int, movId);
    const sets = [];
    const cambios = [];

    const check = (field, sqlType, val, colName, setExpr) => {
      if (val !== undefined && String(val || '') !== String(old[field] || '')) {
        sets.push(setExpr);
        cambios.push({ campo: field, anterior: old[field], nuevo: val });
      }
    };

    if (observacion !== undefined && (observacion||'') !== (old.observacion||''))   { sets.push('observacion = @obs');     r.input('obs',   sql.NVarChar, observacion||'');       cambios.push({campo:'observacion',anterior:old.observacion,nuevo:observacion}); }
    if (numero_remito !== undefined && (numero_remito||'') !== (old.numero_remito||'')) { sets.push('numero_remito = @rem');   r.input('rem',   sql.NVarChar, numero_remito||null);  cambios.push({campo:'numero_remito',anterior:old.numero_remito,nuevo:numero_remito}); }
    if (fecha !== undefined)         { sets.push('fecha = @fecha');         r.input('fecha', sql.DateTime, new Date(fecha));    cambios.push({campo:'fecha',anterior:old.fecha,nuevo:fecha}); }
    if (forma_pago_id !== undefined && forma_pago_id !== old.forma_pago_id) { sets.push('forma_pago_id = @fpid'); r.input('fpid', sql.Int, forma_pago_id||null); cambios.push({campo:'forma_pago_id',anterior:old.forma_pago_id,nuevo:forma_pago_id}); }
    if (precio_kilo !== undefined)   { sets.push('precio_kilo = @pk');     r.input('pk',   sql.Decimal(10,2), parseFloat(precio_kilo)||0); cambios.push({campo:'precio_kilo',anterior:old.precio_kilo,nuevo:precio_kilo}); }
    if (comprador !== undefined && (comprador||'') !== (old.comprador||''))     { sets.push('comprador = @comp');     r.input('comp', sql.NVarChar, comprador||null); cambios.push({campo:'comprador',anterior:old.comprador,nuevo:comprador}); }
    if (estado_cobro !== undefined && (estado_cobro||'') !== (old.estado_cobro||'')) { sets.push('estado_cobro = @ec');   r.input('ec',   sql.NVarChar, estado_cobro||null); cambios.push({campo:'estado_cobro',anterior:old.estado_cobro,nuevo:estado_cobro}); }

    if (!sets.length) { await transaction.rollback(); return res.json({ ok: true }); }
    await r.query('UPDATE MovimientosDeposito SET ' + sets.join(', ') + ' WHERE id = @id');

    for (const c of cambios) {
      await new sql.Request(transaction)
        .input('movimiento_id', sql.Int, movId)
        .input('campo', sql.NVarChar, c.campo)
        .input('anterior', sql.NVarChar, c.anterior != null ? String(c.anterior) : null)
        .input('nuevo', sql.NVarChar, c.nuevo != null ? String(c.nuevo) : null)
        .input('usuario_id', sql.Int, uid)
        .input('usuario_nombre', sql.NVarChar, uname)
        .query(`INSERT INTO AuditoriaVentas (movimiento_id, tabla_origen, accion, campo, valor_anterior, valor_nuevo, usuario_id, usuario_nombre, fecha_hora)
                VALUES (@movimiento_id, 'MovimientosDeposito', 'edicion', @campo, @anterior, @nuevo, @usuario_id, @usuario_nombre, GETDATE())`);
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;