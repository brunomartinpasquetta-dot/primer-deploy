-- Migration: hardening seguridad — 2026-04-02
-- Columnas estado para soft-delete en tablas que usaban hard DELETE

-- Gastos
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Gastos' AND COLUMN_NAME = 'estado')
ALTER TABLE Gastos ADD estado NVARCHAR(20) NOT NULL DEFAULT 'confirmada';

-- CuentaCorrienteClientes
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CuentaCorrienteClientes' AND COLUMN_NAME = 'estado')
ALTER TABLE CuentaCorrienteClientes ADD estado NVARCHAR(20) NOT NULL DEFAULT 'confirmada';

-- CuentaCorrienteProveedores
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CuentaCorrienteProveedores' AND COLUMN_NAME = 'estado')
ALTER TABLE CuentaCorrienteProveedores ADD estado NVARCHAR(20) NOT NULL DEFAULT 'confirmada';
