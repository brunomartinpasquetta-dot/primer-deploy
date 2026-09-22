-- ══════════════════════════════════════════════════════════════
-- PreciosLocales — precios de referencia cargados manualmente
-- Usada por GET/POST /api/cotizaciones/locales (cotizaciones.js).
-- La tabla no estaba en schema-full-2026-04-09.sql y faltaba en la DB
-- de desarrollo (500 en dashboard/ventas). Ejecutado 2026-09-22.
-- ══════════════════════════════════════════════════════════════
USE CosechaFrutilla;
GO

IF OBJECT_ID('dbo.PreciosLocales', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PreciosLocales (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    cultivo      NVARCHAR(50)  NOT NULL,
    precio       DECIMAL(10,2) NOT NULL,
    unidad       NVARCHAR(20)  NOT NULL,
    comprador    NVARCHAR(100) NULL,
    observacion  NVARCHAR(200) NULL,
    fecha        DATETIME      NOT NULL DEFAULT GETDATE(),
    temporada_id INT           NULL
      CONSTRAINT FK_PreciosLocales_Temporada REFERENCES dbo.Temporadas(id)
  );
END
GO
