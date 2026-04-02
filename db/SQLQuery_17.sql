CREATE VIEW VistaBalanceTemporada AS
SELECT
  t.id AS temporada_id,
  t.nombre AS temporada,

  ISNULL((SELECT SUM(sm.kilos * sm.precio_kilo)
          FROM StockMercaderia sm
          WHERE sm.temporada_id = t.id
          AND sm.tipo = 'egreso'
          AND sm.precio_kilo IS NOT NULL), 0) AS ingresos_ventas,

  ISNULL((SELECT SUM(c.total)
          FROM Compras c
          WHERE c.temporada_id = t.id), 0) AS costo_compras,

  ISNULL((SELECT SUM(p.monto)
          FROM Pagos p
          JOIN Juntada j ON j.juntador_id = p.juntador_id
          WHERE p.tipo = 'liquidacion'
          AND CAST(j.fecha_hora AS DATE) BETWEEN t.fecha_inicio AND ISNULL(t.fecha_fin, GETDATE())), 0) AS costo_mano_obra,

  ISNULL((SELECT SUM(g.monto)
          FROM Gastos g
          WHERE g.temporada_id = t.id), 0) AS costo_gastos_generales

FROM Temporadas t;