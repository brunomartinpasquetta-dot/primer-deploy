-- ============================================================================
-- MIGRACIÓN: Nuevo modelo de categorías de clasificación
-- Fecha: 2026-04-03
-- ============================================================================
-- Reemplaza CategoriasFruta (tamano × madurez en una tabla)
-- por CategoriasClasificacion (4 fijas) + SubCategoriasClasificacion (N por padre)
-- ============================================================================

-- ── 1. Crear tabla de categorías padre (fijas) ─────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CategoriasClasificacion')
BEGIN
  CREATE TABLE CategoriasClasificacion (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    nombre      NVARCHAR(50)  NOT NULL,       -- Chica, Mediana, Grande, Descarte
    codigo      NVARCHAR(10)  NOT NULL,       -- CH, ME, GR, DE (para código de lote)
    orden       INT           NOT NULL,       -- Orden de display
    es_descarte BIT           DEFAULT 0,      -- Flag para lógica especial de descarte
    activo      BIT           DEFAULT 1,
    es_fija     BIT           DEFAULT 1       -- No se puede eliminar ni renombrar
  );

  -- Insertar las 4 categorías obligatorias
  INSERT INTO CategoriasClasificacion (nombre, codigo, orden, es_descarte, es_fija)
  VALUES
    ('Chica',    'CH', 1, 0, 1),
    ('Mediana',  'ME', 2, 0, 1),
    ('Grande',   'GR', 3, 0, 1),
    ('Descarte', 'DE', 4, 1, 1);

  PRINT 'Tabla CategoriasClasificacion creada con 4 categorías fijas';
END
ELSE
  PRINT 'Tabla CategoriasClasificacion ya existe — omitiendo';

-- ── 2. Crear tabla de sub-categorías (definidas por el usuario) ────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SubCategoriasClasificacion')
BEGIN
  CREATE TABLE SubCategoriasClasificacion (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    categoria_padre_id    INT           NOT NULL REFERENCES CategoriasClasificacion(id),
    nombre                NVARCHAR(100) NOT NULL,       -- Ej: Madura, Pintona, Para industria
    codigo                NVARCHAR(10)  NOT NULL,       -- Ej: MAD, PIN (para código de lote)
    activo                BIT           DEFAULT 1,
    fecha_creacion        DATETIME      DEFAULT GETDATE(),
    UNIQUE(categoria_padre_id, nombre)
  );

  CREATE INDEX IX_SubCat_padre ON SubCategoriasClasificacion(categoria_padre_id);

  PRINT 'Tabla SubCategoriasClasificacion creada';
END
ELSE
  PRINT 'Tabla SubCategoriasClasificacion ya existe — omitiendo';

-- ── 3. Agregar columnas a Clasificacion para nuevo modelo ──────────────────
-- Reemplazar categoria_id (FK a CategoriasFruta) por categoria_clasif_id + sub_categoria_id

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Clasificacion' AND COLUMN_NAME = 'categoria_clasif_id')
BEGIN
  ALTER TABLE Clasificacion ADD categoria_clasif_id INT NULL REFERENCES CategoriasClasificacion(id);
  PRINT 'Columna categoria_clasif_id agregada a Clasificacion';
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Clasificacion' AND COLUMN_NAME = 'sub_categoria_id')
BEGIN
  ALTER TABLE Clasificacion ADD sub_categoria_id INT NULL REFERENCES SubCategoriasClasificacion(id);
  PRINT 'Columna sub_categoria_id agregada a Clasificacion';
END

-- ── 4. Agregar columnas a LotesMercaderia para nuevo modelo ────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LotesMercaderia' AND COLUMN_NAME = 'categoria_clasif_id')
BEGIN
  ALTER TABLE LotesMercaderia ADD categoria_clasif_id INT NULL REFERENCES CategoriasClasificacion(id);
  PRINT 'Columna categoria_clasif_id agregada a LotesMercaderia';
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LotesMercaderia' AND COLUMN_NAME = 'sub_categoria_id')
BEGIN
  ALTER TABLE LotesMercaderia ADD sub_categoria_id INT NULL REFERENCES SubCategoriasClasificacion(id);
  PRINT 'Columna sub_categoria_id agregada a LotesMercaderia';
END

-- Fecha de envasado (para etiqueta)
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LotesMercaderia' AND COLUMN_NAME = 'fecha_envasado')
BEGIN
  ALTER TABLE LotesMercaderia ADD fecha_envasado DATETIME NULL;
  PRINT 'Columna fecha_envasado agregada a LotesMercaderia';
END

-- ── 5. Agregar fecha_envasado a Embalaje ───────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Embalaje' AND COLUMN_NAME = 'fecha_envasado')
BEGIN
  ALTER TABLE Embalaje ADD fecha_envasado DATETIME NULL DEFAULT GETDATE();
  PRINT 'Columna fecha_envasado agregada a Embalaje';
END

-- ── 6. Índices ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Clasificacion_catClasif')
  CREATE INDEX IX_Clasificacion_catClasif ON Clasificacion(categoria_clasif_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Clasificacion_subCat')
  CREATE INDEX IX_Clasificacion_subCat ON Clasificacion(sub_categoria_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_LotesMerc_catClasif')
  CREATE INDEX IX_LotesMerc_catClasif ON LotesMercaderia(categoria_clasif_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_LotesMerc_subCat')
  CREATE INDEX IX_LotesMerc_subCat ON LotesMercaderia(sub_categoria_id);

PRINT '=== Migración de categorías de clasificación completada ===';
