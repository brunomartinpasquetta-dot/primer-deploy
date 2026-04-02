CREATE TABLE CategoriasGasto (
  id          INT PRIMARY KEY IDENTITY,
  nombre      NVARCHAR(100) NOT NULL,
  descripcion NVARCHAR(200),
  activo      BIT DEFAULT 1
);

INSERT INTO CategoriasGasto (nombre) VALUES ('Implantacion');
INSERT INTO CategoriasGasto (nombre) VALUES ('Semillas y plantines');
INSERT INTO CategoriasGasto (nombre) VALUES ('Preparacion del suelo');
INSERT INTO CategoriasGasto (nombre) VALUES ('Riego');
INSERT INTO CategoriasGasto (nombre) VALUES ('Mano de obra general');
INSERT INTO CategoriasGasto (nombre) VALUES ('Asesoramiento tecnico');
INSERT INTO CategoriasGasto (nombre) VALUES ('Flete y transporte');
INSERT INTO CategoriasGasto (nombre) VALUES ('Energia y combustible');
INSERT INTO CategoriasGasto (nombre) VALUES ('Alquiler de tierra');
INSERT INTO CategoriasGasto (nombre) VALUES ('Mantenimiento de equipos');
INSERT INTO CategoriasGasto (nombre) VALUES ('Impuestos y tasas');
INSERT INTO CategoriasGasto (nombre) VALUES ('Otros');

CREATE TABLE Gastos (
  id              INT PRIMARY KEY IDENTITY,
  temporada_id    INT NOT NULL REFERENCES Temporadas(id),
  lote_id         INT REFERENCES Lotes(id),
  categoria_id    INT NOT NULL REFERENCES CategoriasGasto(id),
  concepto        NVARCHAR(200) NOT NULL,
  monto           DECIMAL(12,2) NOT NULL,
  fecha           DATE DEFAULT GETDATE(),
  forma_pago_id   INT REFERENCES FormasPago(id),
  proveedor_id    INT REFERENCES Proveedores(id),
  observacion     NVARCHAR(200)
);