-- Migration: indices en todas las FK sin indice — 2026-04-02
-- 51 indices creados para cubrir 100% de las foreign keys

-- Aplicaciones (5)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aplicaciones_parcela_id') CREATE INDEX IX_Aplicaciones_parcela_id ON Aplicaciones(parcela_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aplicaciones_producto_id') CREATE INDEX IX_Aplicaciones_producto_id ON Aplicaciones(producto_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aplicaciones_temporada_id') CREATE INDEX IX_Aplicaciones_temporada_id ON Aplicaciones(temporada_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aplicaciones_empleado_id') CREATE INDEX IX_Aplicaciones_empleado_id ON Aplicaciones(empleado_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Aplicaciones_usuario_id') CREATE INDEX IX_Aplicaciones_usuario_id ON Aplicaciones(usuario_id);

-- Caja (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Caja_cheque_id') CREATE INDEX IX_Caja_cheque_id ON Caja(cheque_id);

-- ChequeMovimientos (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChequeMovimientos_cheque_id') CREATE INDEX IX_ChequeMovimientos_cheque_id ON ChequeMovimientos(cheque_id);

-- Cheques (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Cheques_proveedor_id') CREATE INDEX IX_Cheques_proveedor_id ON Cheques(proveedor_id);

-- Compras (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Compras_cheque_id') CREATE INDEX IX_Compras_cheque_id ON Compras(cheque_id);

-- ComprasDetalle (2)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ComprasDetalle_compra_id') CREATE INDEX IX_ComprasDetalle_compra_id ON ComprasDetalle(compra_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ComprasDetalle_producto_id') CREATE INDEX IX_ComprasDetalle_producto_id ON ComprasDetalle(producto_id);

-- Configuracion (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Configuracion_temporada_id') CREATE INDEX IX_Configuracion_temporada_id ON Configuracion(temporada_id);

-- CuentaCorrienteClientes (5)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCClientes_cliente_id') CREATE INDEX IX_CCClientes_cliente_id ON CuentaCorrienteClientes(cliente_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCClientes_forma_pago_id') CREATE INDEX IX_CCClientes_forma_pago_id ON CuentaCorrienteClientes(forma_pago_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCClientes_cheque_id') CREATE INDEX IX_CCClientes_cheque_id ON CuentaCorrienteClientes(cheque_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCClientes_stock_mercaderia_id') CREATE INDEX IX_CCClientes_stock_mercaderia_id ON CuentaCorrienteClientes(stock_mercaderia_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCClientes_temporada_id') CREATE INDEX IX_CCClientes_temporada_id ON CuentaCorrienteClientes(temporada_id);

-- CuentaCorrienteProveedores (5)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCProveedores_proveedor_id') CREATE INDEX IX_CCProveedores_proveedor_id ON CuentaCorrienteProveedores(proveedor_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCProveedores_forma_pago_id') CREATE INDEX IX_CCProveedores_forma_pago_id ON CuentaCorrienteProveedores(forma_pago_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCProveedores_cheque_id') CREATE INDEX IX_CCProveedores_cheque_id ON CuentaCorrienteProveedores(cheque_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCProveedores_compra_id') CREATE INDEX IX_CCProveedores_compra_id ON CuentaCorrienteProveedores(compra_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CCProveedores_temporada_id') CREATE INDEX IX_CCProveedores_temporada_id ON CuentaCorrienteProveedores(temporada_id);

-- Despalillado (5)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Despalillado_parcela_id') CREATE INDEX IX_Despalillado_parcela_id ON Despalillado(parcela_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Despalillado_despalillador_id') CREATE INDEX IX_Despalillado_despalillador_id ON Despalillado(despalillador_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Despalillado_juntada_id') CREATE INDEX IX_Despalillado_juntada_id ON Despalillado(juntada_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Despalillado_deposito_id') CREATE INDEX IX_Despalillado_deposito_id ON Despalillado(deposito_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Despalillado_usuario_id') CREATE INDEX IX_Despalillado_usuario_id ON Despalillado(usuario_id);

-- Gastos (2)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Gastos_parcela_id') CREATE INDEX IX_Gastos_parcela_id ON Gastos(parcela_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Gastos_proveedor_id') CREATE INDEX IX_Gastos_proveedor_id ON Gastos(proveedor_id);

-- Juntada (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Juntada_usuario_id') CREATE INDEX IX_Juntada_usuario_id ON Juntada(usuario_id);

-- JuntadaDestino (2)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_JuntadaDestino_juntada_id') CREATE INDEX IX_JuntadaDestino_juntada_id ON JuntadaDestino(juntada_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_JuntadaDestino_deposito_id') CREATE INDEX IX_JuntadaDestino_deposito_id ON JuntadaDestino(deposito_id);

-- Juntadores (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Juntadores_personal_id') CREATE INDEX IX_Juntadores_personal_id ON Juntadores(personal_id);

-- MovimientosDeposito (3)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovDep_cliente_id') CREATE INDEX IX_MovDep_cliente_id ON MovimientosDeposito(cliente_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovDep_forma_pago_id') CREATE INDEX IX_MovDep_forma_pago_id ON MovimientosDeposito(forma_pago_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovDep_remito_id') CREATE INDEX IX_MovDep_remito_id ON MovimientosDeposito(remito_id);

-- Pagos (3)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pagos_juntador_id') CREATE INDEX IX_Pagos_juntador_id ON Pagos(juntador_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pagos_forma_pago_id') CREATE INDEX IX_Pagos_forma_pago_id ON Pagos(forma_pago_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pagos_cheque_id') CREATE INDEX IX_Pagos_cheque_id ON Pagos(cheque_id);

-- Parcelas (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Parcelas_temporada_id') CREATE INDEX IX_Parcelas_temporada_id ON Parcelas(temporada_id);

-- PrecioHistorico (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PrecioHistorico_temporada_id') CREATE INDEX IX_PrecioHistorico_temporada_id ON PrecioHistorico(temporada_id);

-- Productos (1)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Productos_proveedor_id') CREATE INDEX IX_Productos_proveedor_id ON Productos(proveedor_id);

-- RemitoItems (2)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RemitoItems_remito_id') CREATE INDEX IX_RemitoItems_remito_id ON RemitoItems(remito_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RemitoItems_movimiento_id') CREATE INDEX IX_RemitoItems_movimiento_id ON RemitoItems(movimiento_id);

-- Remitos (3)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Remitos_cliente_id') CREATE INDEX IX_Remitos_cliente_id ON Remitos(cliente_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Remitos_temporada_id') CREATE INDEX IX_Remitos_temporada_id ON Remitos(temporada_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Remitos_forma_pago_id') CREATE INDEX IX_Remitos_forma_pago_id ON Remitos(forma_pago_id);

-- StockMercaderia (2)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMercaderia_cliente_id') CREATE INDEX IX_StockMercaderia_cliente_id ON StockMercaderia(cliente_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockMercaderia_forma_pago_id') CREATE INDEX IX_StockMercaderia_forma_pago_id ON StockMercaderia(forma_pago_id);

-- VentaEmbalaje (2)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VentaEmbalaje_movimiento_id') CREATE INDEX IX_VentaEmbalaje_movimiento_id ON VentaEmbalaje(movimiento_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VentaEmbalaje_producto_id') CREATE INDEX IX_VentaEmbalaje_producto_id ON VentaEmbalaje(producto_id);
