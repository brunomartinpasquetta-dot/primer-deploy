CREATE VIEW VistaCariencia AS
SELECT 
  a.id,
  l.nombre AS lote,
  p.nombre AS producto,
  a.fecha_hora,
  a.carencia_dias,
  DATEADD(day, a.carencia_dias, a.fecha_hora) AS fecha_libre,
  CASE 
    WHEN DATEADD(day, a.carencia_dias, a.fecha_hora) > GETDATE() 
    THEN 'EN CARENCIA' 
    ELSE 'LIBRE' 
  END AS estado
FROM Aplicaciones a
JOIN Lotes l ON a.lote_id = l.id
JOIN Productos p ON a.producto_id = p.id
WHERE a.carencia_dias IS NOT NULL AND a.carencia_dias > 0;