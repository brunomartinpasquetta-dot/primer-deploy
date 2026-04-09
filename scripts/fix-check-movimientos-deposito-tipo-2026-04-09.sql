-- Fix: agregar 'egreso_despalillado' al CHECK constraint de MovimientosDeposito.tipo
-- Bug preexistente: el flujo de despalillado fresco (sin lotes) usa tipo='egreso_despalillado'
-- pero el CHECK no lo incluía, causando error 547 en cada INSERT del flujo fresco.
-- Detectado durante validación E2E del Paso 3 (2026-04-09).

ALTER TABLE MovimientosDeposito DROP CONSTRAINT CK_MovimientosDeposito_tipo;

ALTER TABLE MovimientosDeposito ADD CONSTRAINT CK_MovimientosDeposito_tipo
  CHECK (tipo IN (
    'ingreso',
    'ingreso_anulacion',
    'ingreso_embalaje',
    'ingreso_juntada',
    'egreso_anulacion',
    'egreso_descarte',
    'egreso_despalillado',   -- AGREGADO: flujo despalillado fresco (despalillado.js)
    'egreso_venta'
  ));
