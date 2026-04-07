-- ============================================================
-- SCRIPT CORRECTIVO — MovimientosDeposito + Embalaje
-- Fecha: 2026-04-07
-- ESTADO: APLICADO 07/04/2026 — NO RE-EJECUTAR
-- Backup en _bkp_MovimientosDeposito_20260407 + _bkp_Embalaje_20260407
-- ============================================================
-- Causa: El server no fue reiniciado tras commit 4bc1495,
--        por lo que el flujo /embalar usó código viejo
--        (depositos.js tipo='ingreso' sin sub_lote_id/tipo_embalaje_id)
--        en vez de clasificacion-embalaje.js tipo='ingreso_embalaje'.
-- Afectados: 16 registros MovimientosDeposito + 14 registros Embalaje
-- ============================================================
-- FIX 07/04/2026: orden de WHEN crítico — patrones más largos primero
-- para evitar match prematuro de '%5KG%' sobre '15KG'.
-- Bug detectado en ejecución: '%5KG%' matcheaba "CAJONES PLASTICO 15KG"
-- porque "15KG" contiene "5KG". Se corrigieron 7 MovimientosDeposito +
-- 6 Embalaje adicionales tras detectar la inconsistencia.
-- ============================================================

BEGIN TRANSACTION;

-- ── PASO 1: Corregir MovimientosDeposito ────────────────────
-- Actualizar 16 movimientos que matchean 1:1 con Embalaje (por lote_id + kilos)
-- Cambiar tipo a 'ingreso_embalaje', poblar sub_lote_id, cantidad_envases
UPDATE md
SET md.tipo = 'ingreso_embalaje',
    md.sub_lote_id = md.lote_id,       -- lote_id ya apunta al sub-lote
    md.lote_id = lm.lote_padre_id,     -- lote_id ahora apunta al padre
    md.cantidad_envases = e.cantidad_envases,
    -- IMPORTANTE: evaluar patrones de mayor a menor para evitar match parcial
    md.tipo_embalaje_id = CASE
      WHEN e.tipo_envase LIKE '%20KG%' OR e.tipo_envase LIKE '%20kg%' THEN 5  -- Cajón madera 20kg
      WHEN e.tipo_envase LIKE '%15KG%' OR e.tipo_envase LIKE '%15kg%' THEN 1  -- Cajón plástico 15kg
      WHEN e.tipo_envase LIKE '%10KG%' OR e.tipo_envase LIKE '%10kg%' THEN 7  -- Balde plástico 10kg
      WHEN e.tipo_envase LIKE '%5KG%'  OR e.tipo_envase LIKE '%5kg%'  THEN 2  -- Caja cartón 5kg
      WHEN e.tipo_envase LIKE '%2.5KG%' OR e.tipo_envase LIKE '%2.5kg%' THEN 6 -- Caja cartón 2.5kg
      WHEN e.tipo_envase LIKE '%500%' THEN 3   -- Bandeja plástica 500g
      WHEN e.tipo_envase LIKE '%250%' THEN 4   -- Bandeja plástica 250g
      ELSE NULL
    END
FROM MovimientosDeposito md
JOIN Embalaje e ON e.sub_lote_id = md.lote_id AND e.kilos = md.kilos
JOIN LotesMercaderia lm ON lm.id = md.lote_id
WHERE md.tipo = 'ingreso'
  AND md.temporada_id = 1007
  AND md.sub_lote_id IS NULL;

-- Verificar: debe mostrar 16 filas con tipo='ingreso_embalaje'
SELECT id, tipo, lote_id, sub_lote_id, tipo_embalaje_id, cantidad_envases, kilos
FROM MovimientosDeposito
WHERE tipo = 'ingreso_embalaje' AND temporada_id = 1007;

-- ── PASO 2: Corregir Embalaje.tipo_embalaje_id ─────────────
-- 14 registros tienen tipo_embalaje_id NULL pero tipo_envase texto poblado
UPDATE Embalaje
SET tipo_embalaje_id = CASE
      WHEN tipo_envase LIKE '%20KG%' OR tipo_envase LIKE '%20kg%' THEN 5
      WHEN tipo_envase LIKE '%15KG%' OR tipo_envase LIKE '%15kg%' THEN 1
      WHEN tipo_envase LIKE '%10KG%' OR tipo_envase LIKE '%10kg%' THEN 7
      WHEN tipo_envase LIKE '%5KG%'  OR tipo_envase LIKE '%5kg%'  THEN 2
      WHEN tipo_envase LIKE '%2.5KG%' OR tipo_envase LIKE '%2.5kg%' THEN 6
      WHEN tipo_envase LIKE '%500%' THEN 3
      WHEN tipo_envase LIKE '%250%' THEN 4
      ELSE NULL
    END
WHERE tipo_embalaje_id IS NULL
  AND tipo_envase IS NOT NULL;

-- Verificar: debe mostrar 0 filas con tipo_embalaje_id NULL
SELECT id, tipo_envase, tipo_embalaje_id FROM Embalaje WHERE tipo_embalaje_id IS NULL;

-- ── Si todo OK ──
-- COMMIT;
-- ── Si algo falló ──
-- ROLLBACK;
