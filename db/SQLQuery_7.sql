-- PROVEEDORES
CREATE TABLE Proveedores (
  id          INT PRIMARY KEY IDENTITY,
  nombre      NVARCHAR(100) NOT NULL,
  rubro       NVARCHAR(50),
  contacto    NVARCHAR(100),
  telefono    NVARCHAR(50),
  email       NVARCHAR(100),
  direccion   NVARCHAR(200),
  activo      BIT DEFAULT 1
);

-- COMPRAS (cabecera)
CREATE TABLE Compras (
  id            INT PRIMARY KEY IDENTITY,
  proveedor_id  INT NOT NULL REFERENCES Proveedores(id),
  temporada_id  INT REFERENCES Temporadas(id),
  fecha         DATE DEFAULT GETDATE(),
  total         DECIMAL(12,2),
  observacion   NVARCHAR(200)
);

-- COMPRAS DETALLE (items)
CREATE TABLE ComprasDetalle (
  id          INT PRIMARY KEY IDENTITY,
  compra_id   INT NOT NULL REFERENCES Compras(id),
  producto_id INT NOT NULL REFERENCES Productos(id),
  cantidad    DECIMAL(10,2) NOT NULL,
  precio_unit DECIMAL(10,2) NOT NULL,
  subtotal    DECIMAL(12,2)
);

-- CONFIGURACION POR TEMPORADA
CREATE TABLE Configuracion (
  id                  INT PRIMARY KEY IDENTITY,
  temporada_id        INT NOT NULL REFERENCES Temporadas(id),
  forma_pago          NVARCHAR(20) DEFAULT 'kilo', -- 'kilo', 'jornal', 'mixto'
  jornal_base         DECIMAL(10,2),
  frecuencia_pago     NVARCHAR(20) DEFAULT 'quincenal', -- 'semanal', 'quincenal', 'temporada'
  permite_anticipos   BIT DEFAULT 1,
  observacion         NVARCHAR(200)
);

-- PRECIO HISTORICO DEL KILO
CREATE TABLE PrecioHistorico (
  id            INT PRIMARY KEY IDENTITY,
  temporada_id  INT NOT NULL REFERENCES Temporadas(id),
  precio_kilo   DECIMAL(10,2) NOT NULL,
  destino       NVARCHAR(50) DEFAULT 'fresco', -- 'fresco', 'industria', 'congelado'
  fecha_desde   DATE NOT NULL,
  fecha_hasta   DATE,
  observacion   NVARCHAR(200)
);

-- ACTUALIZAR TABLA PAGOS
ALTER TABLE Pagos ADD periodo_desde    DATE;
ALTER TABLE Pagos ADD periodo_hasta    DATE;
ALTER TABLE Pagos ADD kilos_liquidados DECIMAL(10,2);
ALTER TABLE Pagos ADD precio_kilo      DECIMAL(10,2);
ALTER TABLE Pagos ADD jornal_dias      INT;
ALTER TABLE Pagos ADD anticipos        DECIMAL(10,2) DEFAULT 0;
ALTER TABLE Pagos ADD total_bruto      DECIMAL(10,2);
ALTER TABLE Pagos ADD saldo_final      DECIMAL(10,2);