const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Helper compartido: dado un lote (registro de LotesMercaderia), devuelve la trazabilidad completa.
// Usado por GET /:codigo (busca por codigo_interno/externo/id) y GET /sub-lote/:id (busca por id numérico).
async function buildTrazabilidad(lote, pool) {

    // Determinar lote padre e IDs de sub-lotes para consultas
    const esSubLote = !!lote.lote_padre_id;
    const lotePadreId = esSubLote ? lote.lote_padre_id : lote.id;

    // Obtener info del lote padre si es sub-lote
    let lotePadre = lote;
    if (esSubLote) {
      const padreRes = await pool.request()
        .input('id', sql.Int, lotePadreId)
        .query(`SELECT l.id, l.codigo_interno, l.codigo_externo, l.etapa, l.estado,
                       l.kilos, l.fecha_inicio, l.parcela_id,
                       p.nombre AS parcela, t.nombre AS temporada
                FROM LotesMercaderia l
                LEFT JOIN Parcelas p ON l.parcela_id = p.id
                LEFT JOIN Temporadas t ON l.temporada_id = t.id
                WHERE l.id = @id`);
      if (padreRes.recordset.length) lotePadre = padreRes.recordset[0];
    }

    // IDs de sub-lotes relevantes
    let subLoteIds = [];
    if (esSubLote) {
      subLoteIds = [lote.id];
    } else {
      const subsRes = await pool.request()
        .input('padre_id', sql.Int, lote.id)
        .query('SELECT id FROM LotesMercaderia WHERE lote_padre_id = @padre_id');
      subLoteIds = subsRes.recordset.map(r => r.id);
    }
    const subLoteIdList = subLoteIds.length ? subLoteIds.join(',') : '0';

    // 1. COSECHA — Juntada del lote padre
    const cosechaRes = await pool.request()
      .input('lote_id', sql.Int, lotePadreId)
      .query(`SELECT j.id, j.fecha_hora, j.kilos, j.operador, j.estado, j.observacion,
                     p.nombre AS parcela,
                     jun.apellido + ', ' + jun.nombre AS juntador,
                     u.nombre AS usuario
              FROM Juntada j
              LEFT JOIN Parcelas p ON j.parcela_id = p.id
              LEFT JOIN Juntadores jun ON j.juntador_id = jun.id
              LEFT JOIN Usuarios u ON j.usuario_id = u.id
              WHERE j.lote_id = @lote_id
              ORDER BY j.fecha_hora`);

    // 2. DESPALILLADO
    const despalilladoRes = await pool.request()
      .input('lote_id', sql.Int, lotePadreId)
      .query(`SELECT d.id, d.fecha_hora, d.kilos, d.merma_kg, d.merma_pct, d.operador, d.estado,
                     jun.apellido + ', ' + jun.nombre AS despalillador,
                     u.nombre AS usuario
              FROM Despalillado d
              LEFT JOIN Juntadores jun ON d.despalillador_id = jun.id
              LEFT JOIN Usuarios u ON d.usuario_id = u.id
              WHERE d.lote_id = @lote_id
              ORDER BY d.fecha_hora`);

    // 3. CLASIFICACIÓN
    const clasificacionRes = await pool.request()
      .input('lote_id', sql.Int, lotePadreId)
      .query(`SELECT c.id, c.fecha_hora, c.kilos, c.estado, c.sub_lote_id,
                     cc.nombre AS categoria, sc.nombre AS sub_categoria,
                     u.nombre AS usuario
              FROM Clasificacion c
              LEFT JOIN CategoriasClasificacion cc ON c.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON c.sub_categoria_id = sc.id
              LEFT JOIN Usuarios u ON c.usuario_id = u.id
              WHERE c.lote_id = @lote_id
              ORDER BY c.fecha_hora`);

    // Si es sub-lote, filtrar solo sus clasificaciones
    let clasificaciones = clasificacionRes.recordset;
    if (esSubLote) {
      clasificaciones = clasificaciones.filter(c => c.sub_lote_id === lote.id);
    }

    // 4. EMBALAJE
    const embalajeRes = subLoteIds.length ? await pool.request()
      .query(`SELECT e.id, e.fecha_hora, e.kilos, e.tipo_envase, e.cantidad_envases,
                     e.estado, e.sub_lote_id,
                     dep.nombre AS deposito,
                     u.nombre AS usuario
              FROM Embalaje e
              LEFT JOIN Depositos dep ON e.deposito_id = dep.id
              LEFT JOIN Usuarios u ON e.usuario_id = u.id
              WHERE e.sub_lote_id IN (${subLoteIdList})
              ORDER BY e.fecha_hora`) : { recordset: [] };

    // 5. STOCK — MovimientosDeposito
    const stockRes = subLoteIds.length ? await pool.request()
      .input('lote_id2', sql.Int, lotePadreId)
      .query(`SELECT m.id, m.fecha, m.tipo, m.kilos, m.estado, m.sub_lote_id,
                     dep.nombre AS deposito,
                     u.nombre AS usuario
              FROM MovimientosDeposito m
              LEFT JOIN Depositos dep ON m.deposito_id = dep.id
              LEFT JOIN Usuarios u ON m.usuario_id = u.id
              WHERE m.lote_id = @lote_id2
                 OR m.sub_lote_id IN (${subLoteIdList})
              ORDER BY m.fecha`) : { recordset: [] };

    // 6. VENTA — Remitos via RemitoItems
    const ventaRes = subLoteIds.length ? await pool.request()
      .query(`SELECT ri.id, ri.kilos, ri.precio_kilo, ri.subtotal, ri.sub_lote_id,
                     r.numero AS numero_remito, r.fecha, r.estado AS estado_remito,
                     r.destino,
                     c.nombre AS cliente,
                     fp.nombre AS forma_pago
              FROM RemitoItems ri
              JOIN Remitos r ON ri.remito_id = r.id
              LEFT JOIN Clientes c ON r.cliente_id = c.id
              LEFT JOIN FormasPago fp ON r.forma_pago_id = fp.id
              WHERE ri.sub_lote_id IN (${subLoteIdList})
              ORDER BY r.fecha`) : { recordset: [] };

    // Resumen
    const kgCosechados = cosechaRes.recordset.reduce((s, r) => s + (r.estado !== 'anulada' ? parseFloat(r.kilos) || 0 : 0), 0);
    const kgDespalillados = despalilladoRes.recordset.reduce((s, r) => s + (r.estado !== 'anulada' ? parseFloat(r.kilos) || 0 : 0), 0);
    const kgClasificados = clasificaciones.reduce((s, r) => s + (r.estado !== 'anulada' ? parseFloat(r.kilos) || 0 : 0), 0);
    const kgEmbalados = embalajeRes.recordset.reduce((s, r) => s + (r.estado !== 'anulada' ? parseFloat(r.kilos) || 0 : 0), 0);
    const kgVendidos = ventaRes.recordset.reduce((s, r) => s + (parseFloat(r.kilos) || 0), 0);
    const mermaTotal = kgCosechados > 0 ? ((kgCosechados - kgDespalillados) / kgCosechados * 100) : 0;

    return {
      lote: {
        id: lote.id,
        codigo_interno: lote.codigo_interno,
        codigo_externo: lote.codigo_externo,
        etapa_actual: lote.etapa,
        estado: lote.estado,
        parcela: lote.parcela || lotePadre.parcela,
        temporada: lote.temporada || lotePadre.temporada,
        es_sub_lote: esSubLote,
        lote_padre_codigo: esSubLote ? lotePadre.codigo_interno : null,
        categoria: lote.categoria,
        sub_categoria: lote.sub_categoria
      },
      resumen: {
        kg_cosechados: kgCosechados,
        kg_despalillados: kgDespalillados,
        kg_clasificados: kgClasificados,
        kg_embalados: kgEmbalados,
        kg_vendidos: kgVendidos,
        merma_total_pct: Math.round(mermaTotal * 10) / 10
      },
      cosecha: cosechaRes.recordset,
      despalillado: despalilladoRes.recordset,
      clasificacion: clasificaciones,
      embalaje: embalajeRes.recordset,
      stock: stockRes.recordset,
      venta: ventaRes.recordset
    };
}

// GET /api/trazabilidad/sub-lote/:id — acceso directo por ID numérico de LotesMercaderia
// IMPORTANTE: debe ir ANTES de GET /:codigo para que el matching de Express priorice esta ruta.
router.get('/sub-lote/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const loteRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT l.id, l.codigo_interno, l.codigo_externo, l.lote_padre_id,
                     l.etapa, l.estado, l.kilos, l.fecha_inicio, l.fecha_fin,
                     l.temporada_id, l.parcela_id, l.categoria_clasif_id, l.sub_categoria_id,
                     p.nombre AS parcela, t.nombre AS temporada,
                     cc.nombre AS categoria, sc.nombre AS sub_categoria
              FROM LotesMercaderia l
              LEFT JOIN Parcelas p ON l.parcela_id = p.id
              LEFT JOIN Temporadas t ON l.temporada_id = t.id
              LEFT JOIN CategoriasClasificacion cc ON l.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON l.sub_categoria_id = sc.id
              WHERE l.id = @id`);

    if (!loteRes.recordset.length) {
      return res.status(404).json({ error: 'Sub-lote no encontrado con ID: ' + id });
    }

    const result = await buildTrazabilidad(loteRes.recordset[0], pool);
    res.json(result);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/trazabilidad/:codigo — busca por codigo_externo, codigo_interno o id numérico
router.get('/:codigo', async (req, res) => {
  try {
    const pool = await getPool();
    const codigo = req.params.codigo.trim();

    const isNumeric = /^\d+$/.test(codigo);
    const loteRes = await pool.request()
      .input('codigo', sql.NVarChar, codigo)
      .input('id', sql.Int, isNumeric ? parseInt(codigo) : 0)
      .query(`SELECT l.id, l.codigo_interno, l.codigo_externo, l.lote_padre_id,
                     l.etapa, l.estado, l.kilos, l.fecha_inicio, l.fecha_fin,
                     l.temporada_id, l.parcela_id, l.categoria_clasif_id, l.sub_categoria_id,
                     p.nombre AS parcela, t.nombre AS temporada,
                     cc.nombre AS categoria, sc.nombre AS sub_categoria
              FROM LotesMercaderia l
              LEFT JOIN Parcelas p ON l.parcela_id = p.id
              LEFT JOIN Temporadas t ON l.temporada_id = t.id
              LEFT JOIN CategoriasClasificacion cc ON l.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON l.sub_categoria_id = sc.id
              WHERE l.codigo_externo = @codigo
                 OR l.codigo_interno = @codigo
                 OR l.id = @id`);

    if (!loteRes.recordset.length) {
      return res.status(404).json({ error: 'Lote no encontrado con código: ' + codigo });
    }

    const result = await buildTrazabilidad(loteRes.recordset[0], pool);
    res.json(result);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
