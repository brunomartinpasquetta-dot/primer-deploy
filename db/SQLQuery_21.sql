-- Tabla de depósitos configurables
CREATE TABLE Depositos (
  id              INT PRIMARY KEY IDENTITY,
  nombre          NVARCHAR(100) NOT NULL,
  tipo            NVARCHAR(50) NOT NULL, -- camara_frio, silo, silobolsa, galpon, otro
  capacidad_kg    DECIMAL(12,2),
  costo_kg_dia    DECIMAL(10,4),-- costo por kg por dia almacenado
  ubicacion       NVARCHAR(200),
  observacion     NVARCHAR(200),
  activo          BIT DEFAULT 1
);

-- Tabla de movimientos de deposito
CREATE TABLE MovimientosDeposito (
  id              INT PRIMARY KEY IDENTITY,
  deposito_id     INT NOT NULL REFERENCES Depositos(id),
  temporada_id    INT NOT NULL REFERENCES Temporadas(id),
  lote_id         INT REFERENCES Lotes(id),
  tipo            NVARCHAR(20) NOT NULL, -- ingreso, egreso_venta, egreso_descarte
  kilos           DECIMAL(10,2) NOT NULL,
  precio_kilo     DECIMAL(10,2),         -- solo si es egreso_venta
  comprador       NVARCHAR(100),
  destino_venta   NVARCHAR(50),          -- fresco, industria
  fecha           DATETIME DEFAULT GETDATE(),
  observacion     NVARCHAR(200)
);