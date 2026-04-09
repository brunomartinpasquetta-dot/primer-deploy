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
                 SUM(CASE WHEN sm.tipo = 'ingreso'       THEN sm.kilos
                          WHEN sm.tipo = 'egreso_anulacion' THEN -sm.kilos
                          ELSE 0 END) AS kilos_ingresados,
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%' AND sm.tipo != 'egreso_anulacion' THEN sm.kilos
                          WHEN sm.tipo = 'ingreso_anulacion' THEN -sm.kilos
                          ELSE 0 END) AS kilos_egresados,
                 SUM(CASE WHEN sm.tipo = 'ingreso'       THEN sm.kilos
                          WHEN sm.tipo = 'egreso_anulacion' THEN -sm.kilos
                          ELSE 0 END) -
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%' AND sm.tipo != 'egreso_anulacion' THEN sm.kilos
                          WHEN sm.tipo = 'ingreso_anulacion' THEN -sm.kilos
                          ELSE 0 END) AS stock_actual,
                 SUM(CASE WHEN sm.tipo LIKE 'egreso%' AND sm.tipo != 'egreso_anulacion' THEN sm.kilos * sm.precio_kilo ELSE 0 END) AS total_vendido
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
                    FROM Juntada j JOIN Parcelas l ON j.parcela_id = l.id
                    WHERE ISNULL(j.estado, 'activa') != 'anulada'`;
    if (temporada_id) {
      qJuntada += ' AND l.temporada_id = @temporada_id';
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
        ISNULL(SUM(CASE WHEN etapa = 'descartado' THEN kilos ELSE 0 END), 0) AS kg_descartados
      FROM LotesMercaderia
      WHERE ${wLm}`);

    // KG vendidos desde MovimientosDeposito (dato real de ventas, no etapa de lotes)
    const dbVend = pool.request();
    let wVend = "ISNULL(estado, '') != 'anulada'";
    if (temporada_id) {
      wVend += ' AND temporada_id = @tid';
      dbVend.input('tid', sql.Int, parseInt(temporada_id));
    }
    const vendRes = await dbVend.query(`
      SELECT ISNULL(SUM(CASE WHEN tipo = 'egreso_venta' THEN kilos
                             WHEN tipo = 'ingreso_anulacion' THEN -kilos
                             ELSE 0 END), 0) AS kg_vendidos
      FROM MovimientosDeposito
      WHERE ${wVend} AND tipo IN ('egreso_venta', 'ingreso_anulacion')`);

    const lm = lmRes.recordset[0];
    res.json({
      kg_cosechados:  parseFloat(jRes.recordset[0].kg_cosechados),
      kg_en_proceso:  parseFloat(lm.kg_en_proceso),
      kg_embalado:    parseFloat(lm.kg_embalado),
      kg_en_deposito: parseFloat(lm.kg_en_proceso) + parseFloat(lm.kg_embalado),
      kg_vendidos:    parseFloat(vendRes.recordset[0].kg_vendidos),
      kg_descartados: parseFloat(lm.kg_descartados)
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Vista por lotes: ingresos a stock agrupados por sub_lote + fecha + envase
router.get('/historial-lotes', async (req, res) => {
  try {
    const { temporada_id, desde, hasta } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();

    let where = "e.estado != 'anulada'";
    if (temporada_id) { dbReq.input('temporada_id', sql.Int, parseInt(temporada_id)); where += ' AND sl.temporada_id = @temporada_id'; }
    if (desde) { dbReq.input('desde', sql.Date, desde); where += ' AND CAST(e.fecha_hora AS DATE) >= @desde'; }
    if (hasta) { dbReq.input('hasta', sql.Date, hasta); where += ' AND CAST(e.fecha_hora AS DATE) <= @hasta'; }

    const result = await dbReq.query(`
      SELECT CAST(e.fecha_hora AS DATE) AS fecha,
             sl.codigo_externo AS lote,
             cc.nombre AS categoria,
             sc.nombre AS sub_categoria,
             e.tipo_envase AS presentacion,
             SUM(e.cantidad_envases) AS envases,
             SUM(e.kilos) AS kilos,
             dep.nombre AS deposito
      FROM Embalaje e
      JOIN LotesMercaderia sl ON e.sub_lote_id = sl.id
      LEFT JOIN CategoriasClasificacion cc ON sl.categoria_clasif_id = cc.id
      LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id = sc.id
      LEFT JOIN Depositos dep ON e.deposito_id = dep.id
      WHERE ${where}
      GROUP BY CAST(e.fecha_hora AS DATE), sl.codigo_externo, cc.nombre, sc.nombre, e.tipo_envase, dep.nombre
      ORDER BY CAST(e.fecha_hora AS DATE) DESC, sl.codigo_externo`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Historial de movimientos: solo MovimientosDeposito (fuente unificada)
router.get('/historial', async (req, res) => {
  try {
    const { temporada_id, desde, hasta, parcela_id, tipo } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();

    let wMov = '1=1';

    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      wMov += ' AND m.temporada_id = @temporada_id';
    }
    if (desde) {
      dbReq.input('desde', sql.Date, desde);
      wMov += ' AND CAST(m.fecha AS DATE) >= @desde';
    }
    if (hasta) {
      dbReq.input('hasta', sql.Date, hasta);
      wMov += ' AND CAST(m.fecha AS DATE) <= @hasta';
    }
    if (parcela_id) {
      dbReq.input('parcela_id', sql.Int, parseInt(parcela_id));
      wMov += ' AND m.parcela_id = @parcela_id';
    }

    // Filtro de tipo
    let tipoFiltroMov = '';
    if (tipo === 'ingreso') {
      tipoFiltroMov = " AND m.tipo IN ('ingreso','ingreso_juntada','ingreso_embalaje')";
    } else if (tipo === 'egreso') {
      tipoFiltroMov = " AND m.tipo LIKE 'egreso%'";
    } else if (tipo === 'egreso_venta') {
      tipoFiltroMov = " AND m.tipo = 'egreso_venta'";
    } else if (tipo === 'egreso_descarte') {
      tipoFiltroMov = " AND m.tipo = 'egreso_descarte'";
    }

    const query = `
      SELECT m.id, m.id AS movimiento_id, m.tipo, m.kilos, m.precio_kilo,
             CASE WHEN m.precio_kilo IS NOT NULL THEN m.kilos * m.precio_kilo ELSE NULL END AS total,
             m.comprador, m.destino_venta, m.observacion, m.fecha,
             m.variedad,
             m.cliente_id,
             m.estado_cobro,
             m.estado,
             m.numero_remito,
             m.remito_id,
             m.cantidad_envases,
             fp.nombre AS forma_pago,
             d.nombre  AS deposito,
             m.parcela_id,
             l.nombre AS parcela,
             t.nombre  AS temporada,
             ju.apellido + ', ' + ju.nombre AS cosechero,
             m.juntada_id,
             COALESCE(m.juntador_id, jref.juntador_id) AS juntador_id,
             m.usuario_id,
             u.nombre  AS usuario,
             sl.codigo_externo AS lote_codigo,
             te.nombre AS tipo_envase
      FROM MovimientosDeposito m
      LEFT JOIN Depositos   d    ON m.deposito_id   = d.id
      LEFT JOIN Parcelas    l    ON m.parcela_id     = l.id
      LEFT JOIN Temporadas  t    ON m.temporada_id   = t.id
      LEFT JOIN FormasPago  fp   ON m.forma_pago_id  = fp.id
      LEFT JOIN Juntada    jref ON m.juntada_id   = jref.id AND m.juntador_id IS NULL
      LEFT JOIN Juntadores ju   ON COALESCE(m.juntador_id, jref.juntador_id) = ju.id
      LEFT JOIN Usuarios   u    ON m.usuario_id   = u.id
      LEFT JOIN LotesMercaderia sl ON m.sub_lote_id = sl.id
      LEFT JOIN TiposEmbalaje  te ON m.tipo_embalaje_id = te.id
      WHERE ${wMov}${tipoFiltroMov}
      ORDER BY fecha DESC`;

    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Etapa actual de cada juntada — basado en LotesMercaderia + MovimientosDeposito
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
        ISNULL(md_ing.total_kg, 0)  AS kilos_en_stock,
        ISNULL(md_egr.total_kg, 0)  AS kilos_vendidos,
        CASE
          WHEN j.stock_pendiente = 1
            THEN 'pendiente_despalillado'
          WHEN ISNULL(md_ing.total_kg,0) > 0
           AND ISNULL(md_egr.total_kg,0) >= ISNULL(md_ing.total_kg,0)
            THEN 'vendida'
          WHEN ISNULL(md_egr.total_kg,0) > 0
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
        SELECT juntada_id,
               SUM(CASE WHEN tipo IN ('ingreso','ingreso_juntada','ingreso_embalaje') THEN kilos
                        WHEN tipo = 'egreso_anulacion' THEN -kilos ELSE 0 END) AS total_kg
        FROM MovimientosDeposito WHERE tipo IN ('ingreso','ingreso_juntada','ingreso_embalaje','egreso_anulacion')
        GROUP BY juntada_id
      ) md_ing ON md_ing.juntada_id = j.id
      LEFT JOIN (
        SELECT juntada_id, SUM(kilos) AS total_kg
        FROM MovimientosDeposito WHERE tipo LIKE 'egreso%' AND tipo != 'egreso_anulacion'
        GROUP BY juntada_id
      ) md_egr ON md_egr.juntada_id = j.id
      WHERE ${where}
        AND ISNULL(j.estado, 'activa') != 'anulada'
        AND j.destino NOT IN ('venta_directa','descarte')
      ORDER BY j.fecha_hora DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /historial/:id — ELIMINADO: usar PATCH /historial/:id/auditado en su lugar

// GET /auditoria — historial de auditoría de ventas
router.get('/auditoria', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT TOP 100 * FROM AuditoriaVentas ORDER BY fecha_hora DESC');
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
      .query('SELECT id, tipo, kilos, precio_kilo, cliente_id, forma_pago_id, temporada_id, estado, sub_lote_id, remito_id FROM MovimientosDeposito WHERE id = @id');
    if (!mov.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Movimiento no encontrado' }); }
    const m = mov.recordset[0];
    if (m.estado === 'anulada') { await transaction.rollback(); return res.status(400).json({ error: 'Ya está anulado' }); }

    const total = parseFloat(m.kilos) * (parseFloat(m.precio_kilo) || 0);

    // 1. Revertir financiero (CC o Caja)
    if (total > 0) {
      // Buscar débito CC por FK directa movimiento_deposito_id
      const ccExists = await new sql.Request(transaction)
        .input('mov_id', sql.Int, movId)
        .query(`SELECT id FROM CuentaCorrienteClientes
                WHERE movimiento_deposito_id = @mov_id AND tipo = 'debito'
                  AND ISNULL(estado, 'confirmada') != 'anulada'`);

      if (ccExists.recordset.length > 0) {
        // Soft-delete: marcar el débito como anulado (sin crédito compensatorio)
        await new sql.Request(transaction)
          .input('cc_id', sql.Int, ccExists.recordset[0].id)
          .input('mov_id', sql.Int, movId)
          .query("UPDATE CuentaCorrienteClientes SET estado = 'anulada', observacion = ISNULL(observacion,'') + ' [anulada mov #' + CAST(@mov_id AS VARCHAR) + ']' WHERE id = @cc_id");
      } else {
        // Fue pago contado — revertir en Caja
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

    // 4. Revertir etapa del sub-lote en LotesMercaderia
    if (m.sub_lote_id) {
      // Recalcular kilos vendidos restantes (excluyendo movimientos anulados)
      const slRes = await new sql.Request(transaction)
        .input('sl_id', sql.Int, m.sub_lote_id)
        .query(`SELECT sl.kilos,
                  ISNULL((SELECT SUM(ri.kilos) FROM RemitoItems ri
                          JOIN MovimientosDeposito md ON ri.movimiento_id = md.id
                          WHERE ri.sub_lote_id = @sl_id AND ISNULL(md.estado, '') != 'anulada'), 0) AS kilos_vendidos
                FROM LotesMercaderia sl WHERE sl.id = @sl_id`);
      if (slRes.recordset.length) {
        const sl = slRes.recordset[0];
        const kilosVendidos = parseFloat(sl.kilos_vendidos);
        const kilosTotal = parseFloat(sl.kilos);
        const nuevaEtapa = kilosVendidos <= 0 ? 'embalado' : (kilosVendidos >= kilosTotal ? 'vendido' : 'vendido_parcial');
        await new sql.Request(transaction)
          .input('sl_id', sql.Int, m.sub_lote_id)
          .input('etapa', sql.NVarChar, nuevaEtapa)
          .query('UPDATE LotesMercaderia SET etapa = @etapa WHERE id = @sl_id');
      }
    }

    // 5. Recalcular totales del remito y verificar si todos los items están anulados
    if (m.remito_id) {
      const remCheck = await new sql.Request(transaction)
        .input('rem_id', sql.Int, m.remito_id)
        .query(`SELECT COUNT(*) AS total,
                  SUM(CASE WHEN estado = 'anulada' THEN 1 ELSE 0 END) AS anulados
                FROM MovimientosDeposito WHERE remito_id = @rem_id`);
      const rc = remCheck.recordset[0];
      if (rc.total > 0 && rc.anulados >= rc.total) {
        await new sql.Request(transaction)
          .input('rem_id', sql.Int, m.remito_id)
          .query("UPDATE Remitos SET estado = 'anulado', kilos_total = 0, total = 0 WHERE id = @rem_id");
      } else {
        // Recalcular totales con items activos
        await new sql.Request(transaction)
          .input('rem_id', sql.Int, m.remito_id)
          .query(`UPDATE Remitos SET
                    kilos_total = ISNULL((SELECT SUM(ri.kilos) FROM RemitoItems ri
                                         JOIN MovimientosDeposito md ON ri.movimiento_id = md.id
                                         WHERE ri.remito_id = @rem_id AND ISNULL(md.estado, '') != 'anulada'), 0),
                    total = ISNULL((SELECT SUM(ri.subtotal) FROM RemitoItems ri
                                    JOIN MovimientosDeposito md ON ri.movimiento_id = md.id
                                    WHERE ri.remito_id = @rem_id AND ISNULL(md.estado, '') != 'anulada'), 0)
                  WHERE id = @rem_id`);
      }
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /stock-envases — stock disponible agrupado por tipo de envase
router.get('/stock-envases', async (req, res) => {
  try {
    const pool = await getPool();
    const r = pool.request();
    let where = "md.estado != 'anulada'";
    if (req.query.temporada_id) {
      r.input('temporada_id', sql.Int, parseInt(req.query.temporada_id));
      where += ' AND md.temporada_id = @temporada_id';
    }
    const result = await r.query(`
      SELECT COALESCE(te.nombre, emb_info.tipo_envase) AS tipo_envase,
             cc.nombre AS categoria,
             sc.nombre AS sub_categoria,
             d.nombre  AS deposito,
             SUM(CASE WHEN md.tipo LIKE 'ingreso%' THEN ISNULL(md.cantidad_envases, ISNULL(emb_info.cantidad_envases, 0)) ELSE 0 END)
               - SUM(CASE WHEN md.tipo LIKE 'egreso%' AND md.tipo != 'egreso_anulacion' THEN ISNULL(md.cantidad_envases,0) ELSE 0 END) AS unidades_disponibles,
             SUM(CASE WHEN md.tipo LIKE 'ingreso%' THEN ISNULL(md.kilos,0) ELSE 0 END)
               - SUM(CASE WHEN md.tipo LIKE 'egreso%' AND md.tipo != 'egreso_anulacion' THEN ISNULL(md.kilos,0) ELSE 0 END) AS kg_disponibles
      FROM MovimientosDeposito md
      LEFT JOIN LotesMercaderia lm ON COALESCE(md.sub_lote_id, md.lote_id) = lm.id
      LEFT JOIN CategoriasClasificacion cc ON lm.categoria_clasif_id = cc.id
      LEFT JOIN SubCategoriasClasificacion sc ON lm.sub_categoria_id = sc.id
      LEFT JOIN Depositos d ON md.deposito_id = d.id
      LEFT JOIN TiposEmbalaje te ON md.tipo_embalaje_id = te.id
      OUTER APPLY (
        SELECT TOP 1 e2.tipo_envase, e2.cantidad_envases
        FROM Embalaje e2
        WHERE e2.sub_lote_id = COALESCE(md.sub_lote_id, md.lote_id)
          AND ISNULL(e2.estado, 'confirmada') != 'anulada'
          AND e2.kilos = md.kilos
      ) emb_info
      WHERE ${where}
      GROUP BY COALESCE(te.nombre, emb_info.tipo_envase), cc.nombre, sc.nombre, d.nombre
      HAVING SUM(CASE WHEN md.tipo LIKE 'ingreso%' THEN ISNULL(md.kilos,0) ELSE 0 END)
               - SUM(CASE WHEN md.tipo LIKE 'egreso%' AND md.tipo != 'egreso_anulacion' THEN ISNULL(md.kilos,0) ELSE 0 END) > 0
      ORDER BY COALESCE(te.nombre, emb_info.tipo_envase), kg_disponibles DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar stock por envase' });
  }
});

// GET /estado-lotes — estado de lotes de mercadería (reemplaza etapas por juntada)
router.get('/estado-lotes', async (req, res) => {
  try {
    const pool = await getPool();
    const r = pool.request();
    let where = "lm.estado NOT IN ('anulado', 'eliminado') AND lm.lote_padre_id IS NOT NULL";
    if (req.query.temporada_id) {
      r.input('temporada_id', sql.Int, parseInt(req.query.temporada_id));
      where += ' AND lm.temporada_id = @temporada_id';
    }
    if (req.query.etapa) {
      r.input('etapa', sql.NVarChar, req.query.etapa);
      where += ' AND lm.etapa = @etapa';
    }
    const result = await r.query(`
      SELECT lm.id,
             lm.codigo_externo,
             lm.etapa,
             lm.kilos,
             lm.fecha_inicio,
             lm.fecha_envasado,
             p.nombre AS parcela,
             cc.nombre AS categoria,
             sc.nombre AS sub_categoria,
             d.nombre  AS deposito,
             dp.nombre AS deposito_actual,
             padre.codigo_externo AS lote_padre,
             COALESCE(te.nombre, emb.tipo_envase_txt) AS tipo_envase,
             emb.cantidad_envases AS unidades_embaladas
      FROM LotesMercaderia lm
      LEFT JOIN Parcelas p ON lm.parcela_id = p.id
      LEFT JOIN CategoriasClasificacion cc ON lm.categoria_clasif_id = cc.id
      LEFT JOIN SubCategoriasClasificacion sc ON lm.sub_categoria_id = sc.id
      LEFT JOIN Depositos d ON lm.deposito_id = d.id
      LEFT JOIN Depositos dp ON lm.deposito_actual_id = dp.id
      LEFT JOIN LotesMercaderia padre ON lm.lote_padre_id = padre.id
      LEFT JOIN (
        SELECT sub_lote_id,
               MAX(tipo_embalaje_id) AS tipo_embalaje_id,
               MAX(tipo_envase) AS tipo_envase_txt,
               SUM(cantidad_envases) AS cantidad_envases
        FROM Embalaje WHERE ISNULL(estado,'confirmada') != 'anulada'
        GROUP BY sub_lote_id
      ) emb ON emb.sub_lote_id = lm.id
      LEFT JOIN TiposEmbalaje te ON emb.tipo_embalaje_id = te.id
      WHERE ${where}
      ORDER BY lm.fecha_inicio DESC, lm.id DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar estado de lotes' });
  }
});

// POST /descarte — registrar descarte desde sub-lote embalado
router.post('/descarte', async (req, res) => {
  const { sub_lote_id, kilos, cantidad_envases, observacion } = req.body;
  if (!sub_lote_id || !kilos) return res.status(400).json({ error: 'Sub-lote y kilos son obligatorios' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const uid = req.user ? req.user.id : null;

    // Verificar sub-lote existe y tiene stock
    const slRes = await new sql.Request(transaction)
      .input('sl_id', sql.Int, parseInt(sub_lote_id))
      .query('SELECT id, kilos, temporada_id, parcela_id, deposito_actual_id, deposito_id FROM LotesMercaderia WHERE id = @sl_id');
    if (!slRes.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Sub-lote no encontrado' }); }
    const sl = slRes.recordset[0];
    if (parseFloat(kilos) > parseFloat(sl.kilos)) { await transaction.rollback(); return res.status(400).json({ error: 'Kilos exceden stock del lote (' + sl.kilos + ' kg)' }); }

    // Insertar movimiento de descarte
    await new sql.Request(transaction)
      .input('deposito_id',      sql.Int,           sl.deposito_actual_id || sl.deposito_id || null)
      .input('temporada_id',     sql.Int,           sl.temporada_id)
      .input('parcela_id',       sql.Int,           sl.parcela_id || null)
      .input('tipo',             sql.NVarChar,      'egreso_descarte')
      .input('kilos',            sql.Decimal(10,2), parseFloat(kilos))
      .input('sub_lote_id',      sql.Int,           parseInt(sub_lote_id))
      .input('cantidad_envases', sql.Int,           cantidad_envases ? parseInt(cantidad_envases) : null)
      .input('fecha',            sql.DateTime,      new Date())
      .input('observacion',      sql.NVarChar,      observacion || '')
      .input('usuario_id',       sql.Int,           uid)
      .input('destino_venta',    sql.NVarChar,      'descarte')
      .query(`INSERT INTO MovimientosDeposito
        (deposito_id, temporada_id, parcela_id, tipo, kilos, sub_lote_id, cantidad_envases, fecha, observacion, usuario_id, destino_venta)
        VALUES (@deposito_id, @temporada_id, @parcela_id, @tipo, @kilos, @sub_lote_id, @cantidad_envases, @fecha, @observacion, @usuario_id, @destino_venta)`);

    // Actualizar kilos del lote
    const nuevosKilos = parseFloat(sl.kilos) - parseFloat(kilos);
    if (nuevosKilos <= 0) {
      await new sql.Request(transaction)
        .input('sl_id', sql.Int, parseInt(sub_lote_id))
        .query("UPDATE LotesMercaderia SET kilos = 0, etapa = 'descartado' WHERE id = @sl_id");
    } else {
      await new sql.Request(transaction)
        .input('sl_id', sql.Int, parseInt(sub_lote_id))
        .input('kilos', sql.Decimal(10,2), nuevosKilos)
        .query('UPDATE LotesMercaderia SET kilos = @kilos WHERE id = @sl_id');
    }

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: 'Error al registrar descarte' });
  }
});

module.exports = router;