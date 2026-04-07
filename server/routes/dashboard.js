const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();

    // ── Temporadas activas ──────────────────────────────────────
    const tempRes = await pool.request()
      .query(`SELECT id, nombre, tipo, cultivo, descripcion, fecha_inicio, fecha_fin
              FROM Temporadas WHERE activa = 1 ORDER BY id DESC`);
    const activas = tempRes.recordset;

    // Determinar qué temporada usar
    const tid_param = req.query.temporada_id ? parseInt(req.query.temporada_id) : null;
    let temporada = null;
    let tid       = null;

    if (tid_param && activas.find(t => t.id === tid_param)) {
      temporada = activas.find(t => t.id === tid_param);
      tid       = tid_param;
    } else if (activas.length === 1) {
      temporada = activas[0];
      tid       = activas[0].id;
    }
    // Si hay varias y no se especificó: temporada=null, tid=null → stats globales de hoy

    // ── Métricas de HOY ─────────────────────────────────────────
    const [juntadaHoy, despalilladoHoy, carencia] = await Promise.all([
      pool.request().query(`
        SELECT
          ISNULL(SUM(j.kilos), 0)             AS kilos_hoy,
          COUNT(DISTINCT j.juntador_id)        AS cosechadores_hoy,
          COUNT(*)                             AS registros_hoy
        FROM Juntada j
        WHERE CAST(j.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)`),

      pool.request().query(`
        SELECT ISNULL(SUM(kilos), 0) AS kilos_hoy
        FROM Despalillado
        WHERE CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE)`),

      pool.request().query(`
        SELECT COUNT(*) AS n
        FROM VistaCariencia
        WHERE estado = 'EN CARENCIA'`),
    ]);

    // ── Últimos 10 registros de juntada hoy ─────────────────────
    const ultimos10 = await pool.request().query(`
      SELECT TOP 10
        ju.apellido + ', ' + ju.nombre AS juntador,
        l.nombre   AS parcela,
        j.kilos,
        j.fecha_hora,
        j.destino,
        d.nombre AS deposito_nombre,
        j.precio_venta_directa,
        j.comprador_directo
      FROM Juntada j
      JOIN Parcelas       l  ON j.parcela_id      = l.id
      JOIN Juntadores  ju ON j.juntador_id  = ju.id
      LEFT JOIN Depositos d ON j.deposito_id = d.id
      WHERE CAST(j.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY j.fecha_hora DESC`);

    // ── Flujo del día: destinos de la cosecha ────────────────────
    const flujoHoy = await pool.request().query(`
      SELECT
        ISNULL(SUM(CASE WHEN destino = 'deposito'      THEN kilos ELSE 0 END), 0) AS kg_deposito,
        ISNULL(SUM(CASE WHEN destino = 'venta_directa' THEN kilos ELSE 0 END), 0) AS kg_venta,
        ISNULL(SUM(CASE WHEN destino = 'descarte'      THEN kilos ELSE 0 END), 0) AS kg_descarte,
        ISNULL(SUM(CASE WHEN destino = 'mixto'         THEN kilos ELSE 0 END), 0) AS kg_mixto,
        ISNULL(SUM(CASE WHEN destino IS NULL            THEN kilos ELSE 0 END), 0) AS kg_sin_destino
      FROM Juntada
      WHERE CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE)`);

    // ── Acumulados de la temporada (solo si hay temporada activa) ─
    let temporadaStats = {
      kilos_cosechados: 0,
      kilos_vendidos:   0,
      kilos_camara:     0,
      saldo_caja:       0,
    };

    if (tid) {
      const [kilosTemp, mercaderiaTemp, cajaTemp] = await Promise.all([
        pool.request()
          .input('tid', sql.Int, tid)
          .query(`SELECT ISNULL(SUM(j.kilos), 0) AS total
                  FROM Juntada j
                  JOIN Parcelas l ON j.parcela_id = l.id
                  WHERE l.temporada_id = @tid AND ISNULL(j.estado, 'activa') != 'anulada'`),

        pool.request()
          .input('tid', sql.Int, tid)
          .query(`SELECT
                    ISNULL(SUM(CASE
                      WHEN tipo = 'ingreso' THEN kilos
                      WHEN tipo = 'egreso_anulacion' THEN -kilos
                      ELSE 0
                    END), 0) AS ingresados,
                    ISNULL(SUM(CASE
                      WHEN tipo LIKE 'egreso%' AND tipo != 'egreso_anulacion' THEN kilos
                      WHEN tipo = 'ingreso_anulacion' THEN -kilos
                      ELSE 0
                    END), 0) AS vendidos
                  FROM StockMercaderia
                  WHERE temporada_id = @tid`),

        pool.request()
          .input('tid', sql.Int, tid)
          .query(`SELECT
                    ISNULL(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0     END), 0) -
                    ISNULL(SUM(CASE WHEN tipo = 'egreso'  THEN monto ELSE 0     END), 0) AS saldo
                  FROM Caja
                  WHERE temporada_id = @tid`),
      ]);

      const ingresados = parseFloat(mercaderiaTemp.recordset[0].ingresados);
      const vendidos   = parseFloat(mercaderiaTemp.recordset[0].vendidos);
      temporadaStats = {
        kilos_cosechados: parseFloat(kilosTemp.recordset[0].total),
        kilos_vendidos:   vendidos,
        kilos_camara:     Math.max(0, ingresados - vendidos),
        saldo_caja:       parseFloat(cajaTemp.recordset[0].saldo),
      };
    }

    // ── Alertas ─────────────────────────────────────────────────
    const [alertasCarencia, stockBajo, chequesVencer, enTransito] = await Promise.all([
      pool.request().query(`
        SELECT TOP 10 parcela, producto, fecha_libre
        FROM VistaCariencia
        WHERE estado = 'EN CARENCIA'
        ORDER BY fecha_libre ASC`),

      pool.request().query(`
        SELECT nombre, tipo, presentacion, stock_actual
        FROM Productos
        WHERE activo = 1 AND ISNULL(stock_actual, 0) < 2
        ORDER BY stock_actual ASC`),

      pool.request().query(`
        SELECT c.numero, c.banco, c.monto, c.fecha_vencimiento, c.tipo,
               p.nombre AS proveedor
        FROM Cheques c
        LEFT JOIN Proveedores p ON c.proveedor_id = p.id
        WHERE c.estado = 'pendiente'
          AND c.fecha_vencimiento IS NOT NULL
          AND c.fecha_vencimiento <= DATEADD(day, 7, CAST(GETDATE() AS DATE))
          AND c.fecha_vencimiento >= CAST(GETDATE() AS DATE)
        ORDER BY c.fecha_vencimiento ASC`),

      pool.request().query(`
        SELECT j.id, j.kilos, l.nombre AS parcela, d.nombre AS deposito,
               ju.apellido + ', ' + ju.nombre AS juntador, j.fecha_hora
        FROM Juntada j
        JOIN Parcelas l ON j.parcela_id = l.id
        JOIN Juntadores ju ON j.juntador_id = ju.id
        LEFT JOIN Depositos d ON j.deposito_id = d.id
        WHERE j.stock_pendiente = 1
        ORDER BY j.fecha_hora ASC`),
    ]);

    const f = flujoHoy.recordset[0];
    res.json({
      temporada,
      temporadas_activas: activas,
      hoy: {
        kilos_cosechados:  parseFloat(juntadaHoy.recordset[0].kilos_hoy),
        kilos_despalillados: parseFloat(despalilladoHoy.recordset[0].kilos_hoy),
        cosechadores:      juntadaHoy.recordset[0].cosechadores_hoy,
        registros:         juntadaHoy.recordset[0].registros_hoy,
        alertas_carencia:  carencia.recordset[0].n,
        flujo: {
          kg_deposito:    parseFloat(f.kg_deposito),
          kg_venta:       parseFloat(f.kg_venta),
          kg_descarte:    parseFloat(f.kg_descarte),
          kg_sin_destino: parseFloat(f.kg_mixto) + parseFloat(f.kg_sin_destino),
        },
      },
      temporada_stats: temporadaStats,
      ultimos_registros: ultimos10.recordset,
      alertas: {
        carencia:       alertasCarencia.recordset,
        stock_bajo:     stockBajo.recordset,
        cheques_vencer: chequesVencer.recordset,
        en_transito:    enTransito.recordset,
      },
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
