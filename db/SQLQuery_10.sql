-- Actualizar tabla Aplicaciones con campos nuevos
ALTER TABLE Aplicaciones ADD temporada_id INT REFERENCES Temporadas(id);
ALTER TABLE Aplicaciones ADD empleado_id INT REFERENCES Juntadores(id);
ALTER TABLE Aplicaciones ADD metodo NVARCHAR(50);
ALTER TABLE Aplicaciones ADD condicion_climatica NVARCHAR(100);
ALTER TABLE Aplicaciones ADD dosis_por_hectarea DECIMAL(8,2);
ALTER TABLE Aplicaciones ADD carencia_dias INT;
ALTER TABLE Aplicaciones ADD fecha_hora DATETIME DEFAULT GETDATE();

-- Vista para alertas de carencia
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