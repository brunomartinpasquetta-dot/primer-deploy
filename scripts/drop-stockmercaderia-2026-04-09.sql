-- Paso 4: Eliminar tabla legacy StockMercaderia
-- Prerrequisito: Paso 3 completado (0 INSERTs), lecturas migradas a MovimientosDeposito
-- Fecha: 2026-04-09

-- 1. Backup completo
SELECT * INTO _bkp_stockmercaderia_final_20260409 FROM StockMercaderia;

-- 2. Drop FK + índice + columna en CuentaCorrienteClientes
ALTER TABLE CuentaCorrienteClientes DROP CONSTRAINT [FK__CuentaCor__stock__58D1301D];
DROP INDEX IX_CCClientes_stock_mercaderia_id ON CuentaCorrienteClientes;
ALTER TABLE CuentaCorrienteClientes DROP COLUMN stock_mercaderia_id;

-- 3. Drop tabla StockMercaderia
DROP TABLE StockMercaderia;
