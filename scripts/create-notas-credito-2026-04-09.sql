-- Módulo Notas de Crédito (devoluciones de ventas)
-- Fecha: 2026-04-09

-- 1. Tabla principal NotasCredito
CREATE TABLE NotasCredito (
  id INT IDENTITY PRIMARY KEY,
  numero NVARCHAR(20) NOT NULL UNIQUE,
  remito_id INT NOT NULL,
  cliente_id INT NOT NULL,
  temporada_id INT NULL,
  fecha_emision DATETIME NOT NULL DEFAULT GETDATE(),
  motivo NVARCHAR(500),
  monto_total DECIMAL(18,2) NOT NULL,
  estado NVARCHAR(20) NOT NULL DEFAULT 'emitida',
  forma_pago_reembolso_id INT NULL,
  fecha_reembolso DATETIME NULL,
  referencia_reembolso NVARCHAR(200) NULL,
  caja_movimiento_id INT NULL,
  cuenta_corriente_id INT NULL,
  usuario_id INT NOT NULL,
  fecha_anulacion DATETIME NULL,
  motivo_anulacion NVARCHAR(500) NULL,
  CONSTRAINT FK_NC_Remito FOREIGN KEY (remito_id) REFERENCES Remitos(id),
  CONSTRAINT FK_NC_Cliente FOREIGN KEY (cliente_id) REFERENCES Clientes(id),
  CONSTRAINT FK_NC_FormaPago FOREIGN KEY (forma_pago_reembolso_id) REFERENCES FormasPago(id),
  CONSTRAINT FK_NC_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuarios(id),
  CONSTRAINT CK_NC_estado CHECK (estado IN ('emitida','con_reembolso','anulada'))
);

-- 2. Tabla items NotaCreditoItems
CREATE TABLE NotaCreditoItems (
  id INT IDENTITY PRIMARY KEY,
  nota_credito_id INT NOT NULL,
  remito_item_id INT NOT NULL,
  sub_lote_id INT NOT NULL,
  kg_devueltos DECIMAL(18,3) NOT NULL,
  precio_unitario DECIMAL(18,2) NOT NULL,
  subtotal DECIMAL(18,2) NOT NULL,
  destino NVARCHAR(30) NOT NULL,
  categoria_destino_id INT NULL,
  subcategoria_destino_id INT NULL,
  movimiento_deposito_id INT NULL,
  observacion NVARCHAR(500) NULL,
  CONSTRAINT FK_NCI_NC FOREIGN KEY (nota_credito_id) REFERENCES NotasCredito(id),
  CONSTRAINT FK_NCI_RemitoItem FOREIGN KEY (remito_item_id) REFERENCES RemitoItems(id),
  CONSTRAINT FK_NCI_SubLote FOREIGN KEY (sub_lote_id) REFERENCES LotesMercaderia(id),
  CONSTRAINT FK_NCI_CatDestino FOREIGN KEY (categoria_destino_id) REFERENCES CategoriasClasificacion(id),
  CONSTRAINT FK_NCI_SubCatDestino FOREIGN KEY (subcategoria_destino_id) REFERENCES SubCategoriasClasificacion(id),
  CONSTRAINT CK_NCI_destino CHECK (destino IN ('reingreso_misma','reingreso_recategorizado','merma')),
  CONSTRAINT CK_NCI_kg_positivo CHECK (kg_devueltos > 0)
);

-- 3. Índices
CREATE INDEX IX_NC_remito_id ON NotasCredito(remito_id);
CREATE INDEX IX_NC_cliente_id ON NotasCredito(cliente_id);
CREATE INDEX IX_NC_estado ON NotasCredito(estado);
CREATE INDEX IX_NCI_nota_credito_id ON NotaCreditoItems(nota_credito_id);
CREATE INDEX IX_NCI_sub_lote_id ON NotaCreditoItems(sub_lote_id);

-- 4. Columna nota_credito_id en CuentaCorrienteClientes
ALTER TABLE CuentaCorrienteClientes ADD nota_credito_id INT NULL;
CREATE INDEX IX_CC_nota_credito_id ON CuentaCorrienteClientes(nota_credito_id);

-- 5. Columna nota_credito_id en Caja
ALTER TABLE Caja ADD nota_credito_id INT NULL;

-- 6. Agregar 'ingreso_devolucion' al CHECK constraint de MovimientosDeposito
ALTER TABLE MovimientosDeposito DROP CONSTRAINT CK_MovimientosDeposito_tipo;
ALTER TABLE MovimientosDeposito ADD CONSTRAINT CK_MovimientosDeposito_tipo
  CHECK (tipo IN (
    'ingreso',
    'ingreso_anulacion',
    'ingreso_devolucion',     -- NUEVO: devolución de venta (NC)
    'ingreso_embalaje',
    'ingreso_juntada',
    'egreso_anulacion',
    'egreso_descarte',
    'egreso_despalillado',
    'egreso_venta'
  ));
