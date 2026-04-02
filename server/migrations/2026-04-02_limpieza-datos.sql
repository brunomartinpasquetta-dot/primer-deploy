-- Migration: limpieza de datos — 2026-04-02
-- Ejecutada via MCP mssql en sesion de desarrollo

-- 1. Renombrar productos GLIFOSATO duplicados para diferenciar presentaciones
UPDATE Productos SET nombre = 'GLIFOSATO 1.5L' WHERE id = 1006;
UPDATE Productos SET nombre = 'GLIFOSATO 10L' WHERE id = 1008;

-- 2. Asignar numero_remito retroactivo a las 9 compras anteriores al fix de auto-remito
WITH Numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM Compras
  WHERE numero_remito IS NULL OR numero_remito = ''
)
UPDATE c
SET numero_remito = 'NO-REM' + RIGHT('000' + CAST(n.rn AS VARCHAR), 3)
FROM Compras c
JOIN Numbered n ON c.id = n.id;

-- NOTA: desincronizacion StockMercaderia vs MovimientosDeposito fue un falso positivo.
-- El JOIN por parcela_id fallaba porque NULL = NULL es FALSE en SQL Server.
-- Los registros existen en ambas tablas — no se requiere reconciliacion.
