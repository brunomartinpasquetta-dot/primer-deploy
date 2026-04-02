-- Stock de insumos (movimientos de productos)
CREATE TABLE StockInsumos (
  id          INT PRIMARY KEY IDENTITY,
  producto_id INT NOT NULL REFERENCES Productos(id),
  tipo        NVARCHAR(20) NOT NULL, -- 'compra' o 'aplicacion'
  cantidad    DECIMAL(10,2) NOT NULL,
  costo_total DECIMAL(10,2),
  fecha       DATE DEFAULT GETDATE(),
  proveedor   NVARCHAR(100),
  lote_id     INT REFERENCES Lotes(id), -- solo cuando es aplicacion
  observacion NVARCHAR(200)
);

-- Stock de mercaderia (frutilla)
CREATE TABLE StockMercaderia (
  id          INT PRIMARY KEY IDENTITY,
  temporada_id INT NOT NULL REFERENCES Temporadas(id),
  lote_id     INT NOT NULL REFERENCES Lotes(id),
  tipo        NVARCHAR(20) NOT NULL, -- 'ingreso' o 'egreso'
  kilos       DECIMAL(10,2) NOT NULL,
  destino     NVARCHAR(50), -- 'fresco', 'industria', 'congelado'
  precio_kilo DECIMAL(10,2),
  comprador   NVARCHAR(100),
  fecha       DATE DEFAULT GETDATE(),
  observacion NVARCHAR(200)
);

-- Agregar stock actual a Productos
ALTER TABLE Productos ADD stock_actual DECIMAL(10,2) DEFAULT 0;