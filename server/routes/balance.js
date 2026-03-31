const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Balance general por temporada
router.get('/temporada/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const temporada_id = parseInt(req.params.id);

    // Ingresos por ventas
    const ventas = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT ISNULL(SUM(kilos * precio_kilo), 0) AS total
              FROM StockMercaderia
              WHERE temporada_id = @id AND tipo LIKE 'egreso%' AND precio_kilo IS NOT NULL`);

    // Costo insumos (compras)
    const compras = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT ISNULL(SUM(total), 0) AS total FROM Compras WHERE temporada_id = @id`);

    // Costo mano de obra (pagos liquidados)
    const manoObra = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT ISNULL(SUM(p.monto), 0) AS total
              FROM Pagos p
              WHERE p.tipo = 'liquidacion'
              AND EXISTS (
                SELECT 1 FROM Juntada j
                JOIN Parcelas l ON j.parcela_id = l.id
                WHERE j.juntador_id = p.juntador_id
                AND l.temporada_id = @id
              )`);

    // Gastos generales por categoria
    const gastos = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT cg.nombre AS categoria, SUM(g.monto) AS total
              FROM Gastos g
              JOIN CategoriasGasto cg ON g.categoria_id = cg.id
              WHERE g.temporada_id = @id
              GROUP BY cg.nombre
              ORDER BY total DESC`);

    // Total gastos generales
    const totalGastos = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT ISNULL(SUM(monto), 0) AS total FROM Gastos WHERE temporada_id = @id`);

    // Kilos cosechados
    const kilos = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT ISNULL(SUM(j.kilos), 0) AS total
              FROM Juntada j
              JOIN Parcelas l ON j.parcela_id = l.id
              WHERE l.temporada_id = @id`);

    // Kilos en depósito y descartados
    const depositos = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT
                ISNULL(SUM(CASE WHEN tipo='ingreso'          THEN kilos ELSE 0 END),0) -
                ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%'     THEN kilos ELSE 0 END),0) AS kilos_en_deposito,
                ISNULL(SUM(CASE WHEN tipo='egreso_descarte'  THEN kilos ELSE 0 END),0) AS kilos_descartados
              FROM MovimientosDeposito WHERE temporada_id = @id`);

    // Costo almacenamiento: SUM por depósito de (stock_actual × días_promedio × costo_kg_dia)
    // Simplificado: kilos_en_deposito × costo_kg_dia × días desde inicio temporada
    const costoAlm = await pool.request()
      .input('id', sql.Int, temporada_id)
      .query(`SELECT
                ISNULL(SUM(
                  (
                    ISNULL(SUM(CASE WHEN m.tipo='ingreso'      THEN m.kilos ELSE 0 END),0) -
                    ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' THEN m.kilos ELSE 0 END),0)
                  ) * ISNULL(d.costo_kg_dia, 0)
                    * DATEDIFF(day, t.fecha_inicio, GETDATE())
                ), 0) AS costo_total
              FROM MovimientosDeposito m
              JOIN Depositos d ON m.deposito_id = d.id
              JOIN Temporadas t ON m.temporada_id = t.id
              WHERE m.temporada_id = @id
              GROUP BY d.id, d.costo_kg_dia, t.fecha_inicio`);

    const ingresos = parseFloat(ventas.recordset[0].total);
    const costoCompras = parseFloat(compras.recordset[0].total);
    const costoManoObra = parseFloat(manoObra.recordset[0].total);
    const costoGastos = parseFloat(totalGastos.recordset[0].total);
    const kilosEnDeposito = parseFloat(depositos.recordset[0]?.kilos_en_deposito || 0);
    const kilosDescartados = parseFloat(depositos.recordset[0]?.kilos_descartados || 0);
    const costoAlmacenamiento = costoAlm.recordset.reduce((s, r) => s + parseFloat(r.costo_total || 0), 0);
    const totalCostos = costoCompras + costoManoObra + costoGastos + costoAlmacenamiento;
    const resultado = ingresos - totalCostos;
    const totalKilos = parseFloat(kilos.recordset[0].total);
    const costoXkilo = totalKilos > 0 ? totalCostos / totalKilos : 0;
    const ingresXkilo = totalKilos > 0 ? ingresos / totalKilos : 0;

    res.json({
      ingresos: ingresos,
      costos: {
        compras: costoCompras,
        mano_obra: costoManoObra,
        gastos_generales: costoGastos,
        almacenamiento: costoAlmacenamiento,
        total: totalCostos,
        detalle_gastos: gastos.recordset
      },
      resultado: resultado,
      margen: ingresos > 0 ? ((resultado / ingresos) * 100).toFixed(1) : 0,
      kilos_cosechados: totalKilos,
      kilos_en_deposito: kilosEnDeposito,
      kilos_descartados: kilosDescartados,
      costo_por_kilo: costoXkilo.toFixed(2),
      ingreso_por_kilo: ingresXkilo.toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Balance por parcela
router.get('/parcela/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const parcela_id = parseInt(req.params.id);

    const ventas = await pool.request()
      .input('id', sql.Int, parcela_id)
      .query(`SELECT ISNULL(SUM(kilos * precio_kilo), 0) AS total
              FROM StockMercaderia
              WHERE parcela_id = @id AND tipo LIKE 'egreso%' AND precio_kilo IS NOT NULL`);

    const insumos = await pool.request()
      .input('id', sql.Int, parcela_id)
      .query(`SELECT ISNULL(SUM(costo_total), 0) AS total FROM Aplicaciones WHERE parcela_id = @id`);

    const gastos = await pool.request()
      .input('id', sql.Int, parcela_id)
      .query(`SELECT cg.nombre AS categoria, SUM(g.monto) AS total
              FROM Gastos g
              JOIN CategoriasGasto cg ON g.categoria_id = cg.id
              WHERE g.parcela_id = @id
              GROUP BY cg.nombre
              ORDER BY total DESC`);

    const totalGastos = await pool.request()
      .input('id', sql.Int, parcela_id)
      .query(`SELECT ISNULL(SUM(monto), 0) AS total FROM Gastos WHERE parcela_id = @id`);

    const kilos = await pool.request()
      .input('id', sql.Int, parcela_id)
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total FROM Juntada WHERE parcela_id = @id`);

    const ingresos = parseFloat(ventas.recordset[0].total);
    const costoInsumos = parseFloat(insumos.recordset[0].total);
    const costoGastos = parseFloat(totalGastos.recordset[0].total);
    const totalCostos = costoInsumos + costoGastos;
    const resultado = ingresos - totalCostos;
    const totalKilos = parseFloat(kilos.recordset[0].total);
    const costoXkilo = totalKilos > 0 ? totalCostos / totalKilos : 0;

    res.json({
      ingresos: ingresos,
      costos: {
        insumos: costoInsumos,
        gastos_especificos: costoGastos,
        total: totalCostos,
        detalle_gastos: gastos.recordset
      },
      resultado: resultado,
      margen: ingresos > 0 ? ((resultado / ingresos) * 100).toFixed(1) : 0,
      kilos_cosechados: totalKilos,
      costo_por_kilo: costoXkilo.toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Balance por periodo (rango de fechas)
router.get('/periodo', async (req, res) => {
  try {
    const { temporada_id, desde, hasta } = req.query;
    const pool = await getPool();

    const reqVentas = pool.request()
      .input('desde', sql.Date, desde)
      .input('hasta', sql.Date, hasta);
    if (temporada_id) reqVentas.input('temporada_id', sql.Int, parseInt(temporada_id));
    const ventas = await reqVentas.query(`SELECT ISNULL(SUM(kilos * precio_kilo), 0) AS total
              FROM StockMercaderia
              WHERE tipo LIKE 'egreso%' AND precio_kilo IS NOT NULL
              AND fecha >= @desde AND fecha <= @hasta
              ${temporada_id ? 'AND temporada_id = @temporada_id' : ''}`);

    const reqGastos = pool.request()
      .input('desde', sql.Date, desde)
      .input('hasta', sql.Date, hasta);
    if (temporada_id) reqGastos.input('temporada_id', sql.Int, parseInt(temporada_id));
    const gastos = await reqGastos.query(`SELECT ISNULL(SUM(monto), 0) AS total
              FROM Gastos
              WHERE fecha >= @desde AND fecha <= @hasta
              ${temporada_id ? 'AND temporada_id = @temporada_id' : ''}`);

    const reqCompras = pool.request()
      .input('desde', sql.Date, desde)
      .input('hasta', sql.Date, hasta);
    if (temporada_id) reqCompras.input('temporada_id', sql.Int, parseInt(temporada_id));
    const compras = await reqCompras.query(`SELECT ISNULL(SUM(total), 0) AS total
              FROM Compras
              WHERE fecha >= @desde AND fecha <= @hasta
              ${temporada_id ? 'AND temporada_id = @temporada_id' : ''}`);

    const pagos = await pool.request()
      .input('desde', sql.Date, desde)
      .input('hasta', sql.Date, hasta)
      .query(`SELECT ISNULL(SUM(monto), 0) AS total
              FROM Pagos
              WHERE tipo = 'liquidacion'
              AND fecha >= @desde AND fecha <= @hasta`);

    const ingresos = parseFloat(ventas.recordset[0].total);
    const totalCostos = parseFloat(gastos.recordset[0].total) +
                        parseFloat(compras.recordset[0].total) +
                        parseFloat(pagos.recordset[0].total);

    res.json({
      periodo: { desde, hasta },
      ingresos,
      costos: totalCostos,
      resultado: ingresos - totalCostos,
      margen: ingresos > 0 ? (((ingresos - totalCostos) / ingresos) * 100).toFixed(1) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;