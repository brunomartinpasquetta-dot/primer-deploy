-- ============================================================
-- ADD movimiento_deposito_id FK a CuentaCorrienteClientes
-- Fecha: 2026-04-08
-- ESTADO: PENDIENTE — Ejecutar tras revisión
-- ============================================================
-- Objetivo: Vincular directamente cada débito CC con su
-- MovimientosDeposito de venta, reemplazando el match heurístico
-- por FK directa. También desbloquea la futura eliminación de
-- stock_mercaderia_id (FK legacy a StockMercaderia).
-- ============================================================

BEGIN TRANSACTION;

-- ── PASO 1: Agregar columna ─────────────────────────────────
ALTER TABLE CuentaCorrienteClientes
ADD movimiento_deposito_id INT NULL;

-- ── PASO 2: FK a MovimientosDeposito ────────────────────────
ALTER TABLE CuentaCorrienteClientes
ADD CONSTRAINT FK_CC_MovimientosDeposito
FOREIGN KEY (movimiento_deposito_id) REFERENCES MovimientosDeposito(id);

-- ── PASO 3: Índice para performance en JOINs ────────────────
CREATE INDEX IX_CC_movimiento_deposito_id
ON CuentaCorrienteClientes(movimiento_deposito_id);

-- ── PASO 4: Migrar registros existentes ─────────────────────
-- Mapeo identificado por cruce cliente_id + monto + tipo_venta:
--   CC 1 (debito $1,000,000 ARTESANA R-0001) → MovDeposito 2060 (anulada)
--   CC 2 (debito $470,000 ARTESANA R-0001)   → MovDeposito 2061
--   CC 3 (credito $100,000 cobro manual)      → NULL (no es venta)
--   CC 4 (debito $42,000 FRUTILLAS R-0004)    → MovDeposito 3071
--   CC 5 (debito $90,000 FRUTILLAS R-0006)    → MovDeposito 3074

UPDATE CuentaCorrienteClientes
SET movimiento_deposito_id = 2060
WHERE id = 1 AND movimiento_deposito_id IS NULL;

UPDATE CuentaCorrienteClientes
SET movimiento_deposito_id = 2061
WHERE id = 2 AND movimiento_deposito_id IS NULL;

-- CC id=3 es crédito (cobro manual), no tiene movimiento de venta → queda NULL

UPDATE CuentaCorrienteClientes
SET movimiento_deposito_id = 3071
WHERE id = 4 AND movimiento_deposito_id IS NULL;

UPDATE CuentaCorrienteClientes
SET movimiento_deposito_id = 3074
WHERE id = 5 AND movimiento_deposito_id IS NULL;

-- ── VERIFICACIÓN ────────────────────────────────────────────
-- Debe mostrar 4 débitos con movimiento_deposito_id poblado,
-- 1 crédito con NULL
SELECT id, tipo, monto, movimiento_deposito_id, observacion
FROM CuentaCorrienteClientes
ORDER BY id;

-- ── Si todo OK ──
-- COMMIT;
-- ── Si algo falló ──
-- ROLLBACK;
