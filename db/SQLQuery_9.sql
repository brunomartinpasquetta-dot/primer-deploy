-- FORMAS DE PAGO
CREATE TABLE FormasPago (
  id          INT PRIMARY KEY IDENTITY,
  nombre      NVARCHAR(50) NOT NULL,
  activo      BIT DEFAULT 1
);

INSERT INTO FormasPago (nombre) VALUES ('Efectivo');
INSERT INTO FormasPago (nombre) VALUES ('Transferencia');
INSERT INTO FormasPago (nombre) VALUES ('Cheque propio');
INSERT INTO FormasPago (nombre) VALUES ('Cheque tercero');
INSERT INTO FormasPago (nombre) VALUES ('Tarjeta debito');
INSERT INTO FormasPago (nombre) VALUES ('Tarjeta credito');

-- CHEQUES
CREATE TABLE Cheques (
  id              INT PRIMARY KEY IDENTITY,
  tipo            NVARCHAR(20) NOT NULL, -- 'emitido' o 'recibido'
  numero          NVARCHAR(50),
  banco           NVARCHAR(100),
  monto           DECIMAL(12,2) NOT NULL,
  fecha_emision   DATE,
  fecha_vencimiento DATE,
  estado          NVARCHAR(20) DEFAULT 'pendiente', -- 'pendiente', 'cobrado', 'depositado', 'rechazado'
  proveedor_id    INT REFERENCES Proveedores(id),
  observacion     NVARCHAR(200)
);

-- CAJA GENERAL
CREATE TABLE Caja (
  id              INT PRIMARY KEY IDENTITY,
  tipo            NVARCHAR(10) NOT NULL, -- 'ingreso' o 'egreso'
  concepto        NVARCHAR(200) NOT NULL,
  monto           DECIMAL(12,2) NOT NULL,
  forma_pago_id   INT REFERENCES FormasPago(id),
  cheque_id       INT REFERENCES Cheques(id),
  fecha           DATE DEFAULT GETDATE(),
  temporada_id    INT REFERENCES Temporadas(id),
  observacion     NVARCHAR(200)
);

-- CUENTA CORRIENTE PROVEEDORES
CREATE TABLE CuentaCorrienteProveedores (
  id              INT PRIMARY KEY IDENTITY,
  proveedor_id    INT NOT NULL REFERENCES Proveedores(id),
  tipo            NVARCHAR(10) NOT NULL, -- 'debito' (compra) o 'credito' (pago)
  monto           DECIMAL(12,2) NOT NULL,
  forma_pago_id   INT REFERENCES FormasPago(id),
  cheque_id       INT REFERENCES Cheques(id),
  compra_id       INT REFERENCES Compras(id),
  fecha           DATE DEFAULT GETDATE(),
  observacion     NVARCHAR(200)
);

-- CLIENTES
CREATE TABLE Clientes (
  id          INT PRIMARY KEY IDENTITY,
  nombre      NVARCHAR(100) NOT NULL,
  contacto    NVARCHAR(100),
  telefono    NVARCHAR(50),
  email       NVARCHAR(100),
  direccion   NVARCHAR(200),
  activo      BIT DEFAULT 1
);

-- CUENTA CORRIENTE CLIENTES
CREATE TABLE CuentaCorrienteClientes (
  id              INT PRIMARY KEY IDENTITY,
  cliente_id      INT NOT NULL REFERENCES Clientes(id),
  tipo            NVARCHAR(10) NOT NULL, -- 'debito' (venta) o 'credito' (cobro)
  monto           DECIMAL(12,2) NOT NULL,
  forma_pago_id   INT REFERENCES FormasPago(id),
  cheque_id       INT REFERENCES Cheques(id),
  fecha           DATE DEFAULT GETDATE(),
  observacion     NVARCHAR(200)
);

-- AGREGAR FORMA DE PAGO A COMPRAS Y PAGOS
ALTER TABLE Compras ADD forma_pago_id INT REFERENCES FormasPago(id);
ALTER TABLE Compras ADD cheque_id INT REFERENCES Cheques(id);
ALTER TABLE Pagos ADD forma_pago_id INT REFERENCES FormasPago(id);
ALTER TABLE Pagos ADD cheque_id INT REFERENCES Cheques(id);