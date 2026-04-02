-- Migration: Agregar columna estado a tablas de módulos de campo
-- Fecha: 2026-04-02
-- Permite soft-delete (anulación) con reversión de stock

-- Juntada
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Juntada' AND COLUMN_NAME = 'estado')
  ALTER TABLE Juntada ADD estado NVARCHAR(20) NOT NULL DEFAULT 'confirmada';

-- Despalillado
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Despalillado' AND COLUMN_NAME = 'estado')
  ALTER TABLE Despalillado ADD estado NVARCHAR(20) NOT NULL DEFAULT 'confirmada';

-- Aplicaciones
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Aplicaciones' AND COLUMN_NAME = 'estado')
  ALTER TABLE Aplicaciones ADD estado NVARCHAR(20) NOT NULL DEFAULT 'confirmada';
