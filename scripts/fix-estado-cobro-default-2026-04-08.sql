-- ============================================================
-- FIX BUG-05: Cambiar DEFAULT de estado_cobro en MovimientosDeposito
-- De: 'cobrada' (femenino, inconsistente)
-- A:  'cobrado' (masculino, consistente con el código)
-- ESTADO: PENDIENTE — Revisar antes de ejecutar
-- ============================================================

-- Paso 1: Eliminar constraint DEFAULT existente
ALTER TABLE MovimientosDeposito
DROP CONSTRAINT DF__Movimient__estad__1A9EF37A;

-- Paso 2: Crear nuevo DEFAULT con valor correcto
ALTER TABLE MovimientosDeposito
ADD CONSTRAINT DF_MovDeposito_estado_cobro
DEFAULT ('cobrado') FOR estado_cobro;

-- Paso 3: Corregir registros existentes con valor viejo
UPDATE MovimientosDeposito
SET estado_cobro = 'cobrado'
WHERE estado_cobro = 'cobrada';

-- Verificar
SELECT estado_cobro, COUNT(*) AS cant
FROM MovimientosDeposito
GROUP BY estado_cobro;
