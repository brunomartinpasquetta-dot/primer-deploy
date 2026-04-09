const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Helper: filtros comunes desde query params
function buildFiltros(req) {
  const f = {};
  f.temporada_id = req.query.temporada_id ? parseInt(req.query.temporada_id) : null;
  f.fecha_desde = req.query.fecha_desde || null;
  f.fecha_hasta = req.query.fecha_hasta || null;
  f.variedad_id = req.query.variedad_id ? parseInt(req.query.variedad_id) : null;
  f.parcela_id = req.query.parcela_id ? parseInt(req.query.parcela_id) : null;
  f.cliente_id = req.query.cliente_id ? parseInt(req.query.cliente_id) : null;
  f.categoria_id = req.query.categoria_id ? parseInt(req.query.categoria_id) : null;
  return f;
}

// Helper: aplicar filtros comunes a un request de SQL
function applyJuntadaFilters(r, f, alias) {
  const a = alias || 'j';
  const conds = [`ISNULL(${a}.estado, 'activa') != 'anulada'`];
  if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('p.temporada_id = @tid'); }
  if (f.fecha_desde) { r.input('fdesde', sql.Date, f.fecha_desde); conds.push(`${a}.fecha_hora >= @fdesde`); }
  if (f.fecha_hasta) { r.input('fhasta', sql.Date, f.fecha_hasta); conds.push(`${a}.fecha_hora <= DATEADD(day,1,@fhasta)`); }
  if (f.variedad_id) { r.input('vid', sql.Int, f.variedad_id); conds.push('p.variedad_id = @vid'); }
  if (f.parcela_id) { r.input('pid', sql.Int, f.parcela_id); conds.push(`${a}.parcela_id = @pid`); }
  return conds.join(' AND ');
}

// ── B1: Rinde por variedad ────────────────────────────────────
router.get('/rinde-variedad', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const where = applyJuntadaFilters(r, f);
    const result = await r.query(`
      SELECT vf.nombre AS variedad, MAX(p.hectareas) AS superficie_ha,
             SUM(j.kilos) AS kg_cosechados,
             CAST(SUM(j.kilos) / NULLIF(MAX(p.hectareas),0) AS DECIMAL(10,2)) AS kg_por_ha
      FROM Juntada j
      JOIN Parcelas p ON j.parcela_id = p.id
      LEFT JOIN variedades_frutilla vf ON p.variedad_id = vf.id
      WHERE ${where}
      GROUP BY vf.nombre
      ORDER BY kg_cosechados DESC`);
    res.json(result.recordset);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B2: Rinde por parcela ─────────────────────────────────────
router.get('/rinde-parcela', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const where = applyJuntadaFilters(r, f);
    const result = await r.query(`
      SELECT p.nombre AS parcela, vf.nombre AS variedad,
             p.hectareas, SUM(j.kilos) AS kg_cosechados,
             CAST(SUM(j.kilos) / NULLIF(p.hectareas,0) AS DECIMAL(10,2)) AS kg_por_ha,
             COUNT(j.id) AS cantidad_juntadas,
             MIN(j.fecha_hora) AS fecha_primera, MAX(j.fecha_hora) AS fecha_ultima
      FROM Juntada j
      JOIN Parcelas p ON j.parcela_id = p.id
      LEFT JOIN variedades_frutilla vf ON p.variedad_id = vf.id
      WHERE ${where}
      GROUP BY p.id, p.nombre, vf.nombre, p.hectareas
      ORDER BY kg_cosechados DESC`);
    res.json(result.recordset);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B3: Evolucion cosecha diaria ──────────────────────────────
router.get('/evolucion-cosecha', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const where = applyJuntadaFilters(r, f);
    const result = await r.query(`
      SELECT CONVERT(date, j.fecha_hora) AS fecha, SUM(j.kilos) AS kg_dia
      FROM Juntada j
      JOIN Parcelas p ON j.parcela_id = p.id
      WHERE ${where}
      GROUP BY CONVERT(date, j.fecha_hora)
      ORDER BY fecha`);
    let acum = 0;
    const rows = result.recordset.map(function(row) {
      acum += parseFloat(row.kg_dia);
      return { fecha: row.fecha, kg_dia: parseFloat(row.kg_dia), acumulado: parseFloat(acum.toFixed(3)) };
    });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B4: Descarte por variedad ─────────────────────────────────
router.get('/descarte-por-variedad', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = [];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('lm.temporada_id = @tid'); }
    if (f.variedad_id) { r.input('vid', sql.Int, f.variedad_id); conds.push('p.variedad_id = @vid'); }
    conds.push("lm.estado != 'anulada'");
    const where = conds.join(' AND ');
    const result = await r.query(`
      SELECT vf.nombre AS variedad,
             SUM(cl.kilos) AS kg_totales,
             SUM(CASE WHEN cc.nombre = 'Descarte' THEN cl.kilos ELSE 0 END) AS kg_descarte
      FROM Clasificacion cl
      JOIN LotesMercaderia lm ON cl.lote_id = lm.id
      LEFT JOIN Parcelas p ON lm.parcela_id = p.id
      LEFT JOIN variedades_frutilla vf ON p.variedad_id = vf.id
      LEFT JOIN CategoriasClasificacion cc ON cl.categoria_clasif_id = cc.id
      WHERE ${where}
      GROUP BY vf.nombre
      HAVING SUM(cl.kilos) > 0`);
    const rows = result.recordset.map(function(row) {
      const total = parseFloat(row.kg_totales);
      const desc = parseFloat(row.kg_descarte);
      return { ...row, porcentaje_descarte: total > 0 ? parseFloat(((desc / total) * 100).toFixed(1)) : 0 };
    });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B5: Productividad cosecheros ──────────────────────────────
router.get('/productividad-cosecheros', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const where = applyJuntadaFilters(r, f);
    const result = await r.query(`
      SELECT ISNULL(jt.nombre,'') + ' ' + ISNULL(jt.apellido,'') AS cosechero,
             COUNT(j.id) AS cantidad_juntadas,
             SUM(j.kilos) AS kg_totales,
             CAST(SUM(j.kilos) / NULLIF(COUNT(j.id),0) AS DECIMAL(10,2)) AS kg_promedio_por_juntada
      FROM Juntada j
      JOIN Parcelas p ON j.parcela_id = p.id
      LEFT JOIN Juntadores jt ON j.juntador_id = jt.id
      WHERE ${where}
      GROUP BY jt.id, jt.nombre, jt.apellido
      ORDER BY kg_totales DESC`);
    res.json(result.recordset);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B6: Ranking clientes ──────────────────────────────────────
router.get('/ranking-clientes', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = ["ISNULL(md.estado,'') != 'anulada'", "md.tipo = 'egreso_venta'"];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('md.temporada_id = @tid'); }
    if (f.fecha_desde) { r.input('fdesde', sql.Date, f.fecha_desde); conds.push('md.fecha >= @fdesde'); }
    if (f.fecha_hasta) { r.input('fhasta', sql.Date, f.fecha_hasta); conds.push('md.fecha <= DATEADD(day,1,@fhasta)'); }
    if (f.cliente_id) { r.input('cid', sql.Int, f.cliente_id); conds.push('md.cliente_id = @cid'); }
    const where = conds.join(' AND ');
    const result = await r.query(`
      SELECT c.nombre AS cliente,
             COUNT(DISTINCT md.remito_id) AS cantidad_ventas,
             SUM(md.kilos) AS kg_comprados,
             SUM(md.kilos * ISNULL(md.precio_kilo,0)) AS monto_total,
             CAST(SUM(md.kilos * ISNULL(md.precio_kilo,0)) / NULLIF(COUNT(DISTINCT md.remito_id),0) AS DECIMAL(12,2)) AS ticket_promedio,
             MAX(md.fecha) AS ultima_compra
      FROM MovimientosDeposito md
      JOIN Clientes c ON md.cliente_id = c.id
      WHERE ${where}
      GROUP BY c.id, c.nombre
      ORDER BY monto_total DESC`);
    res.json(result.recordset);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B7: Ventas por categoria ──────────────────────────────────
router.get('/ventas-por-categoria', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = ["ISNULL(md.estado,'') != 'anulada'", "md.tipo = 'egreso_venta'"];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('md.temporada_id = @tid'); }
    if (f.fecha_desde) { r.input('fdesde', sql.Date, f.fecha_desde); conds.push('md.fecha >= @fdesde'); }
    if (f.fecha_hasta) { r.input('fhasta', sql.Date, f.fecha_hasta); conds.push('md.fecha <= DATEADD(day,1,@fhasta)'); }
    if (f.categoria_id) { r.input('catid', sql.Int, f.categoria_id); conds.push('sl.categoria_clasif_id = @catid'); }
    const where = conds.join(' AND ');
    const result = await r.query(`
      SELECT ISNULL(cc.nombre,'Sin clasificar') AS categoria,
             ISNULL(sc.nombre,'') AS subcategoria,
             SUM(ri.kilos) AS kg_vendidos,
             SUM(ri.subtotal) AS monto_total,
             CAST(SUM(ri.subtotal) / NULLIF(SUM(ri.kilos),0) AS DECIMAL(10,2)) AS precio_promedio_kg
      FROM RemitoItems ri
      JOIN MovimientosDeposito md ON ri.movimiento_id = md.id
      LEFT JOIN LotesMercaderia sl ON ri.sub_lote_id = sl.id
      LEFT JOIN CategoriasClasificacion cc ON sl.categoria_clasif_id = cc.id
      LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id = sc.id
      WHERE ${where}
      GROUP BY cc.nombre, sc.nombre
      ORDER BY monto_total DESC`);
    const total = result.recordset.reduce(function(s, r) { return s + parseFloat(r.monto_total || 0); }, 0);
    const rows = result.recordset.map(function(row) {
      return { ...row, porcentaje_del_total: total > 0 ? parseFloat(((parseFloat(row.monto_total) / total) * 100).toFixed(1)) : 0 };
    });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B8: Evolucion ventas diaria ───────────────────────────────
router.get('/evolucion-ventas', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = ["ISNULL(md.estado,'') != 'anulada'", "md.tipo = 'egreso_venta'"];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('md.temporada_id = @tid'); }
    if (f.fecha_desde) { r.input('fdesde', sql.Date, f.fecha_desde); conds.push('md.fecha >= @fdesde'); }
    if (f.fecha_hasta) { r.input('fhasta', sql.Date, f.fecha_hasta); conds.push('md.fecha <= DATEADD(day,1,@fhasta)'); }
    const where = conds.join(' AND ');
    const result = await r.query(`
      SELECT CONVERT(date, md.fecha) AS fecha,
             SUM(md.kilos) AS kg_vendidos,
             SUM(md.kilos * ISNULL(md.precio_kilo,0)) AS monto_vendido
      FROM MovimientosDeposito md
      WHERE ${where}
      GROUP BY CONVERT(date, md.fecha)
      ORDER BY fecha`);
    res.json(result.recordset);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B9: Ingresos vs egresos por mes ───────────────────────────
router.get('/ingresos-vs-egresos', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = [];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('temporada_id = @tid'); }
    if (f.fecha_desde) { r.input('fdesde', sql.Date, f.fecha_desde); conds.push('fecha >= @fdesde'); }
    if (f.fecha_hasta) { r.input('fhasta', sql.Date, f.fecha_hasta); conds.push('fecha <= @fhasta'); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const result = await r.query(`
      SELECT FORMAT(fecha, 'yyyy-MM') AS mes,
             SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0 END) AS ingresos,
             SUM(CASE WHEN tipo='egreso' THEN monto ELSE 0 END) AS egresos,
             SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END) AS neto
      FROM Caja
      ${where}
      GROUP BY FORMAT(fecha, 'yyyy-MM')
      ORDER BY mes`);
    res.json(result.recordset);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B10: Margen por categoria ─────────────────────────────────
// Calcula costo real de insumos aplicados por parcela y lo distribuye a las
// categorías vendidas según la parcela mayoritaria del lote padre (via Juntada).
// Aplicaciones filtradas por temporada de la parcela (Aplicaciones.temporada_id
// puede ser NULL en datos históricos).
router.get('/margen-por-categoria', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = ["ISNULL(md.estado,'') != 'anulada'", "md.tipo = 'egreso_venta'"];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('md.temporada_id = @tid'); }
    const where = conds.join(' AND ');
    const result = await r.query(`
      WITH costo_parcela AS (
        SELECT p.id AS parcela_id,
          CAST(
            ISNULL((SELECT SUM(a.costo_total) FROM Aplicaciones a
                    WHERE a.parcela_id = p.id AND ISNULL(a.estado,'activa') != 'anulada'), 0)
            /
            NULLIF((SELECT SUM(j.kilos) FROM Juntada j
                    WHERE j.parcela_id = p.id AND ISNULL(j.estado,'activa') != 'anulada'), 0)
          AS DECIMAL(18,4)) AS costo_por_kg
        FROM Parcelas p
      ),
      lote_parcela_mayoritaria AS (
        SELECT lote_id, parcela_id FROM (
          SELECT j.lote_id, j.parcela_id,
                 ROW_NUMBER() OVER (PARTITION BY j.lote_id ORDER BY SUM(j.kilos) DESC) AS rn
          FROM Juntada j
          WHERE ISNULL(j.estado,'activa') != 'anulada' AND j.lote_id IS NOT NULL
          GROUP BY j.lote_id, j.parcela_id
        ) t WHERE rn = 1
      )
      SELECT ISNULL(cc.nombre,'Sin clasificar') AS categoria,
             SUM(ri.kilos) AS kg_vendidos,
             SUM(ri.subtotal) AS ingreso_bruto,
             SUM(ri.kilos * ISNULL(cp.costo_por_kg, 0)) AS costo_estimado,
             SUM(ri.subtotal - ri.kilos * ISNULL(cp.costo_por_kg, 0)) AS margen_bruto
      FROM RemitoItems ri
      JOIN MovimientosDeposito md ON ri.movimiento_id = md.id
      LEFT JOIN LotesMercaderia sl ON ri.sub_lote_id = sl.id
      LEFT JOIN lote_parcela_mayoritaria lpm ON sl.lote_padre_id = lpm.lote_id
      LEFT JOIN costo_parcela cp ON lpm.parcela_id = cp.parcela_id
      LEFT JOIN CategoriasClasificacion cc ON sl.categoria_clasif_id = cc.id
      WHERE ${where}
      GROUP BY cc.nombre
      ORDER BY ingreso_bruto DESC`);

    // Calcular margen_porcentual en JS para evitar div/0 en SQL
    const rows = result.recordset.map(function(row) {
      const ing = parseFloat(row.ingreso_bruto) || 0;
      const mar = parseFloat(row.margen_bruto) || 0;
      return {
        ...row,
        margen_porcentual: ing > 0 ? parseFloat(((mar / ing) * 100).toFixed(2)) : null
      };
    });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B11: Saldos cuentas corrientes ────────────────────────────
router.get('/saldos-cuentas-corrientes', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = ["ISNULL(cc.estado,'confirmada') != 'anulada'"];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('cc.temporada_id = @tid'); }
    if (f.cliente_id) { r.input('cid', sql.Int, f.cliente_id); conds.push('cc.cliente_id = @cid'); }
    const where = conds.join(' AND ');
    const result = await r.query(`
      SELECT c.nombre AS cliente,
             SUM(CASE WHEN cc.tipo='debito' THEN cc.monto ELSE 0 END) AS saldo_debe,
             SUM(CASE WHEN cc.tipo='credito' THEN cc.monto ELSE 0 END) AS saldo_haber,
             SUM(CASE WHEN cc.tipo='debito' THEN cc.monto ELSE -cc.monto END) AS saldo_neto,
             MAX(cc.fecha_hora) AS ultimo_movimiento
      FROM CuentaCorrienteClientes cc
      JOIN Clientes c ON cc.cliente_id = c.id
      WHERE ${where}
      GROUP BY c.id, c.nombre
      ORDER BY saldo_neto DESC`);
    res.json(result.recordset);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

// ── B12: Rotacion de stock ────────────────────────────────────
router.get('/rotacion-stock', async (req, res) => {
  try {
    const pool = await getPool();
    const f = buildFiltros(req);
    const r = pool.request();
    const conds = ["sl.lote_padre_id IS NOT NULL"];
    if (f.temporada_id) { r.input('tid', sql.Int, f.temporada_id); conds.push('sl.temporada_id = @tid'); }
    if (f.variedad_id) { r.input('vid', sql.Int, f.variedad_id); conds.push('p.variedad_id = @vid'); }
    const where = conds.join(' AND ');
    const result = await r.query(`
      SELECT sl.codigo_interno AS sub_lote,
             vf.nombre AS variedad,
             sl.fecha_inicio AS fecha_cosecha,
             (SELECT MIN(md2.fecha) FROM MovimientosDeposito md2
              WHERE md2.sub_lote_id = sl.id AND md2.tipo = 'egreso_venta' AND ISNULL(md2.estado,'') != 'anulada') AS fecha_primera_venta,
             sl.kilos AS kg,
             sl.etapa AS destino
      FROM LotesMercaderia sl
      LEFT JOIN LotesMercaderia lp ON sl.lote_padre_id = lp.id
      LEFT JOIN Parcelas p ON ISNULL(sl.parcela_id, lp.parcela_id) = p.id
      LEFT JOIN variedades_frutilla vf ON p.variedad_id = vf.id
      WHERE ${where}
      ORDER BY sl.fecha_inicio DESC`);
    const rows = result.recordset.map(function(row) {
      let dias = null;
      if (row.fecha_cosecha && row.fecha_primera_venta) {
        dias = Math.round((new Date(row.fecha_primera_venta) - new Date(row.fecha_cosecha)) / (1000 * 60 * 60 * 24));
      }
      return { ...row, dias_en_stock: dias };
    });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno' }); }
});

module.exports = router;
