const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { tabla_origen, accion, desde, hasta, page } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();

    let filters1 = '1=1', filters2 = '1=1', filters3 = '1=1', filters4 = '1=1';

    if (tabla_origen) {
      dbReq.input('tabla_origen', sql.NVarChar, tabla_origen);
      filters1 += ' AND tabla_origen = @tabla_origen';
      filters2 += " AND 'Compras' = @tabla_origen";
      filters3 += ' AND tabla_origen = @tabla_origen';
      filters4 += " AND tabla = @tabla_origen";
    }
    if (accion) {
      dbReq.input('accion', sql.NVarChar, accion);
      filters1 += ' AND accion = @accion';
      filters2 += ' AND accion = @accion';
      filters3 += ' AND accion = @accion';
      filters4 += " AND 'edicion' = @accion";
    }
    if (desde) {
      dbReq.input('desde', sql.Date, desde);
      filters1 += ' AND CAST(fecha_hora AS DATE) >= @desde';
      filters2 += ' AND CAST(fecha_hora AS DATE) >= @desde';
      filters3 += ' AND CAST(fecha_hora AS DATE) >= @desde';
      filters4 += ' AND CAST(fecha_hora AS DATE) >= @desde';
    }
    if (hasta) {
      dbReq.input('hasta', sql.Date, hasta);
      filters1 += ' AND CAST(fecha_hora AS DATE) <= @hasta';
      filters2 += ' AND CAST(fecha_hora AS DATE) <= @hasta';
      filters3 += ' AND CAST(fecha_hora AS DATE) <= @hasta';
      filters4 += ' AND CAST(fecha_hora AS DATE) <= @hasta';
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = 50;
    const offset = (pageNum - 1) * pageSize;

    const query = `
      ;WITH Unificada AS (
        SELECT fecha_hora, tabla_origen, accion, registro_id, usuario_nombre,
               motivo, valor_anterior, valor_nuevo, campo
        FROM AuditoriaClasificacion WHERE ${filters1}
        UNION ALL
        SELECT fecha_hora, 'Compras' AS tabla_origen, accion, compra_id AS registro_id,
               usuario_nombre, NULL AS motivo, valor_anterior, valor_nuevo, campo
        FROM AuditoriaCompras WHERE ${filters2}
        UNION ALL
        SELECT fecha_hora, tabla_origen, accion, movimiento_id AS registro_id,
               usuario_nombre, NULL AS motivo, valor_anterior, valor_nuevo, campo
        FROM AuditoriaVentas WHERE ${filters3}
        UNION ALL
        SELECT fecha_hora, tabla AS tabla_origen, 'edicion' AS accion, registro_id,
               CAST(usuario_id AS NVARCHAR) AS usuario_nombre,
               motivo, valor_anterior, valor_nuevo, campo
        FROM EdicionesHistorial WHERE ${filters4}
      )
      SELECT *, COUNT(*) OVER() AS total_count
      FROM Unificada
      ORDER BY fecha_hora DESC
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;

    const result = await dbReq.query(query);
    const total = result.recordset.length > 0 ? result.recordset[0].total_count : 0;

    res.json({
      data: result.recordset.map(r => { delete r.total_count; return r; }),
      total,
      page: pageNum,
      pages: Math.ceil(total / pageSize)
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
