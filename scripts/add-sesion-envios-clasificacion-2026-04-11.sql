-- Script: sesiones de despalillado + envios parciales a clasificacion
-- Fecha: 2026-04-11
-- Ejecutado: SI (en firme, con backup previo)

-- Backup previo: SELECT * INTO _bkp_despalillado_20260411 FROM Despalillado

-- 1. Codigo de sesion por dia en Despalillado
ALTER TABLE Despalillado ADD codigo_sesion NVARCHAR(10) NULL;

-- 2. Tabla de envios parciales a clasificacion
CREATE TABLE EnviosClasificacion (
  id INT IDENTITY(1,1) PRIMARY KEY,
  lote_id INT NOT NULL REFERENCES LotesMercaderia(id),
  kilos DECIMAL(10,3) NOT NULL,
  codigo_sesion_origen NVARCHAR(10) NULL,
  despalillado_ids NVARCHAR(500) NULL,
  fecha_hora DATETIME NOT NULL DEFAULT GETDATE(),
  usuario_id INT NULL REFERENCES Usuarios(id),
  estado NVARCHAR(20) NOT NULL DEFAULT 'enviado'
);

CREATE INDEX IX_EnviosClasificacion_lote ON EnviosClasificacion(lote_id, estado);
