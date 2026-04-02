-- Agregar campos a Lotes
ALTER TABLE Lotes ADD variedad NVARCHAR(100);
ALTER TABLE Lotes ADD cantidad_plantines INT;
ALTER TABLE Lotes ADD destino_fruta NVARCHAR(50);

-- Agregar campo tipo a Juntadores (juntador / despalillador)
ALTER TABLE Juntadores ADD tipo NVARCHAR(30) DEFAULT 'juntador';

-- Nueva tabla Productos
CREATE TABLE Productos (
  id               INT PRIMARY KEY IDENTITY,
  nombre           NVARCHAR(100) NOT NULL,
  descripcion      NVARCHAR(200),
  tipo             NVARCHAR(50),
  presentacion     NVARCHAR(50),
  contenido_litros DECIMAL(8,2),
  costo_unitario   DECIMAL(10,2),
  activo           BIT DEFAULT 1
);

-- Nueva tabla Aplicaciones
CREATE TABLE Aplicaciones (
  id             INT PRIMARY KEY IDENTITY,
  lote_id        INT NOT NULL REFERENCES Lotes(id),
  producto_id    INT NOT NULL REFERENCES Productos(id),
  cantidad_usada DECIMAL(8,2) NOT NULL,
  fecha          DATE DEFAULT GETDATE(),
  observacion    NVARCHAR(200),
  costo_total    DECIMAL(10,2)
);

-- Nueva tabla Pagos
CREATE TABLE Pagos (
  id           INT PRIMARY KEY IDENTITY,
  juntador_id  INT NOT NULL REFERENCES Juntadores(id),
  monto        DECIMAL(10,2) NOT NULL,
  tipo         NVARCHAR(50),
  fecha        DATE DEFAULT GETDATE(),
  observacion  NVARCHAR(200)
);
