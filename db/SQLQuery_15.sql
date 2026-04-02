-- CATEGORIAS DE GASTOS
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

-- GASTOS GENERALES
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

-- VISTA BALANCE POR TEMPORADA
CREATE VIEW VistaBalanceTemporada AS
SELECT
  t.id AS temporada_id,
  t.nombre AS temporada,

  -- INGRESOS: ventas de mercaderia
  ISNULL((SELECT SUM(sm.kilos * sm.precio_kilo)
          FROM StockMercaderia sm
          WHERE sm.temporada_id = t.id
          AND sm.tipo = 'egreso'
          AND sm.precio_kilo IS NOT NULL), 0) AS ingresos_ventas,

  -- COSTO INSUMOS: compras vinculadas a temporada
  ISNULL((SELECT SUM(c.total)
          FROM Compras c
          WHERE c.temporada_id = t.id), 0) AS costo_compras,

  -- COSTO MANO DE OBRA: pagos a juntadores
  ISNULL((SELECT SUM(p.monto)
          FROM Pagos p
          JOIN Juntada j ON j.juntador_id = p.juntador_id
          WHERE p.tipo = 'liquidacion'
          AND CAST(j.fecha_hora AS DATE) BETWEEN t.fecha_inicio AND ISNULL(t.fecha_fin, GETDATE())), 0) AS costo_mano_obra,

  -- GASTOS GENERALES registrados manualmente
  ISNULL((SELECT SUM(g.monto)
          FROM Gastos g
          WHERE g.temporada_id = t.id), 0) AS costo_gastos_generales

FROM Temporadas t;