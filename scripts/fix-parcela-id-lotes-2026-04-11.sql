-- Migración: popular parcela_id en LotesMercaderia para lotes padre con NULL
-- Usa la parcela mayoritaria (por kg) de las juntadas del lote
-- 100% match con el workaround ROW_NUMBER de estadisticas.js (verificado)

UPDATE lm
SET lm.parcela_id = sub.parcela_mayoritaria
FROM LotesMercaderia lm
CROSS APPLY (
  SELECT TOP 1 j.parcela_id AS parcela_mayoritaria
  FROM Juntada j
  WHERE j.lote_id = lm.id AND ISNULL(j.estado, 'activa') != 'anulada'
  GROUP BY j.parcela_id
  ORDER BY SUM(j.kilos) DESC
) sub
WHERE lm.lote_padre_id IS NULL
  AND lm.parcela_id IS NULL;
