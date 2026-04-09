-- Drop columna Parcelas.variedad (texto) tras migración completa de consumers a variedad_id + JOIN
-- Prerrequisito: todos los SELECTs, INSERTs y UPDATEs de Parcelas.variedad migrados a variedad_id.
-- Datos migrados previamente (commit 15fdf05): CAMAROSA→6, FESTIVAL→12 (0 huérfanos)

-- 1. Backup previo
SELECT id, variedad, variedad_id
INTO _bkp_parcelas_variedad_texto_20260409
FROM Parcelas;

-- 2. Drop columna
ALTER TABLE Parcelas DROP COLUMN variedad;
