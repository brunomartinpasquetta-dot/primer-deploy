ALTER TABLE Aplicaciones ADD temporada_id INT REFERENCES Temporadas(id);
ALTER TABLE Aplicaciones ADD empleado_id INT REFERENCES Juntadores(id);
ALTER TABLE Aplicaciones ADD metodo NVARCHAR(50);
ALTER TABLE Aplicaciones ADD condicion_climatica NVARCHAR(100);
ALTER TABLE Aplicaciones ADD dosis_por_hectarea DECIMAL(8,2);
ALTER TABLE Aplicaciones ADD carencia_dias INT;
ALTER TABLE Aplicaciones ADD fecha_hora DATETIME DEFAULT GETDATE();