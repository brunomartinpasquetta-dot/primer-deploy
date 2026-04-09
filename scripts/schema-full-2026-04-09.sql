-- ══════════════════════════════════════════════════════════════════
-- CosechaApp — Schema completo generado automaticamente
-- Fecha: 2026-04-09
-- Uso: ejecutar en DB CosechaFrutilla vacia para crear todas las tablas,
-- FKs, indices y CHECK constraints del sistema.
-- ══════════════════════════════════════════════════════════════════

-- ══ TABLAS ══

CREATE TABLE [AplicacionEmpleados] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [aplicacion_id] INT NOT NULL,
  [empleado_id] INT NOT NULL,
  [fecha_creacion] DATETIME NOT NULL DEFAULT (getdate()),
  [hora_inicio] DATETIME NULL,
  [hora_fin] DATETIME NULL,
  CONSTRAINT [PK__Aplicaci__3213E83F3A4A1D04] PRIMARY KEY ([id])
);

CREATE TABLE [Aplicaciones] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [parcela_id] INT NOT NULL,
  [producto_id] INT NOT NULL,
  [cantidad_usada] DECIMAL(10,3) NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [observacion] NVARCHAR(200) NULL,
  [costo_total] DECIMAL(10,2) NULL,
  [temporada_id] INT NULL,
  [empleado_id] INT NULL,
  [metodo] NVARCHAR(50) NULL,
  [condicion_climatica] NVARCHAR(100) NULL,
  [dosis_por_hectarea] DECIMAL(10,3) NULL,
  [carencia_dias] INT NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [unidad_aplicacion] NVARCHAR(20) NULL,
  [usuario_id] INT NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  [hora_inicio] DATETIME NULL,
  [hora_fin] DATETIME NULL,
  CONSTRAINT [PK__Aplicaci__3213E83FAF273553] PRIMARY KEY ([id])
);

CREATE TABLE [AuditoriaClasificacion] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [registro_id] INT NOT NULL,
  [tabla_origen] NVARCHAR(50) NOT NULL,
  [accion] NVARCHAR(50) NOT NULL,
  [campo] NVARCHAR(100) NULL,
  [valor_anterior] NVARCHAR(500) NULL,
  [valor_nuevo] NVARCHAR(500) NULL,
  [motivo] NVARCHAR(500) NULL,
  [usuario_id] INT NULL,
  [usuario_nombre] NVARCHAR(100) NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__Auditori__3213E83F43312E7A] PRIMARY KEY ([id])
);

CREATE TABLE [AuditoriaCompras] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [compra_id] INT NOT NULL,
  [accion] NVARCHAR(50) NOT NULL,
  [campo] NVARCHAR(100) NULL,
  [valor_anterior] NVARCHAR(500) NULL,
  [valor_nuevo] NVARCHAR(500) NULL,
  [usuario_id] INT NULL,
  [usuario_nombre] NVARCHAR(100) NULL,
  [fecha_hora] DATETIME NOT NULL,
  CONSTRAINT [PK__Auditori__3213E83FF2C5EE95] PRIMARY KEY ([id])
);

CREATE TABLE [AuditoriaVentas] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [movimiento_id] INT NOT NULL,
  [tabla_origen] NVARCHAR(50) NOT NULL,
  [accion] NVARCHAR(50) NOT NULL,
  [campo] NVARCHAR(100) NULL,
  [valor_anterior] NVARCHAR(500) NULL,
  [valor_nuevo] NVARCHAR(500) NULL,
  [usuario_id] INT NULL,
  [usuario_nombre] NVARCHAR(100) NULL,
  [fecha_hora] DATETIME NOT NULL,
  CONSTRAINT [PK__Auditori__3213E83F9E250469] PRIMARY KEY ([id])
);

CREATE TABLE [Caja] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [tipo] NVARCHAR(10) NOT NULL,
  [concepto] NVARCHAR(200) NOT NULL,
  [monto] DECIMAL(12,2) NOT NULL,
  [forma_pago_id] INT NULL,
  [cheque_id] INT NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [temporada_id] INT NULL,
  [observacion] NVARCHAR(200) NULL,
  [medio_pago] NVARCHAR(20) NULL,
  [usuario_nombre] NVARCHAR(100) NULL,
  [nota_credito_id] INT NULL,
  CONSTRAINT [PK__Caja__3213E83FFEB82A2A] PRIMARY KEY ([id])
);

CREATE TABLE [CategoriasClasificacion] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(50) NOT NULL,
  [codigo] NVARCHAR(10) NOT NULL,
  [orden] INT NOT NULL,
  [es_descarte] BIT NULL DEFAULT ((0)),
  [activo] BIT NULL DEFAULT ((1)),
  [es_fija] BIT NULL DEFAULT ((1)),
  CONSTRAINT [PK__Categori__3213E83F155FC2B4] PRIMARY KEY ([id])
);

CREATE TABLE [CategoriasFruta] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [tamano] NVARCHAR(20) NOT NULL,
  [madurez] NVARCHAR(20) NOT NULL,
  [activo] BIT NOT NULL DEFAULT ((1)),
  CONSTRAINT [PK__Categori__3213E83F67959442] PRIMARY KEY ([id])
);

CREATE TABLE [CategoriasGasto] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [descripcion] NVARCHAR(200) NULL,
  [activo] BIT NULL DEFAULT ((1)),
  CONSTRAINT [PK__Categori__3213E83F77D9E63F] PRIMARY KEY ([id])
);

CREATE TABLE [CategoriasTarea] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] VARCHAR(100) NOT NULL,
  [categoria] VARCHAR(50) NOT NULL,
  [activo] BIT NULL DEFAULT ((1)),
  CONSTRAINT [PK__Categori__3213E83F618CE527] PRIMARY KEY ([id])
);

CREATE TABLE [ChequeMovimientos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [cheque_id] INT NOT NULL,
  [tipo] NVARCHAR(30) NOT NULL,
  [fecha] DATETIME NOT NULL DEFAULT (getdate()),
  [descripcion] NVARCHAR(300) NULL,
  [usuario_id] INT NULL,
  CONSTRAINT [PK__ChequeMo__3213E83F2D234FF6] PRIMARY KEY ([id])
);

CREATE TABLE [Cheques] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [tipo] NVARCHAR(20) NOT NULL,
  [numero] NVARCHAR(50) NULL,
  [banco] NVARCHAR(100) NULL,
  [monto] DECIMAL(12,2) NOT NULL,
  [fecha_emision] DATE NULL,
  [fecha_vencimiento] DATE NULL,
  [estado] NVARCHAR(20) NULL DEFAULT ('pendiente'),
  [proveedor_id] INT NULL,
  [observacion] NVARCHAR(200) NULL,
  [tipo_cheque] NVARCHAR(20) NULL DEFAULT ('fisico'),
  [id_echeq] NVARCHAR(50) NULL,
  [cbu_origen] NVARCHAR(30) NULL,
  [cuit_emisor] NVARCHAR(15) NULL,
  [emisor] NVARCHAR(150) NULL,
  [receptor] NVARCHAR(150) NULL,
  [origen] NVARCHAR(30) NULL,
  [cliente_id] INT NULL,
  [created_at] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__Cheques__3213E83FFE5C8C0B] PRIMARY KEY ([id])
);

CREATE TABLE [Clasificacion] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [lote_id] INT NOT NULL,
  [sub_lote_id] INT NULL,
  [despalillado_id] INT NULL,
  [categoria_id] INT NULL,
  [kilos] DECIMAL(10,3) NOT NULL,
  [merma] DECIMAL(10,3) NOT NULL DEFAULT ((0)),
  [empleado_id] INT NULL,
  [fecha_hora] DATETIME NOT NULL DEFAULT (getdate()),
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  [usuario_id] INT NULL,
  [categoria_clasif_id] INT NULL,
  [sub_categoria_id] INT NULL,
  CONSTRAINT [PK__Clasific__3213E83F0C4B030F] PRIMARY KEY ([id])
);

CREATE TABLE [Clientes] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [contacto] NVARCHAR(100) NULL,
  [telefono] NVARCHAR(50) NULL,
  [email] NVARCHAR(100) NULL,
  [direccion] NVARCHAR(200) NULL,
  [activo] BIT NULL DEFAULT ((1)),
  CONSTRAINT [PK__Clientes__3213E83FE183FB82] PRIMARY KEY ([id])
);

CREATE TABLE [Compras] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [proveedor_id] INT NOT NULL,
  [temporada_id] INT NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [total] DECIMAL(12,2) NULL,
  [observacion] NVARCHAR(200) NULL,
  [forma_pago_id] INT NULL,
  [cheque_id] INT NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [usuario_id] INT NULL,
  [numero_remito] NVARCHAR(50) NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  CONSTRAINT [PK__Compras__3213E83FAAED9606] PRIMARY KEY ([id])
);

CREATE TABLE [ComprasDetalle] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [compra_id] INT NOT NULL,
  [producto_id] INT NOT NULL,
  [cantidad] DECIMAL(10,3) NOT NULL,
  [precio_unit] DECIMAL(10,3) NOT NULL,
  [subtotal] DECIMAL(12,2) NULL,
  [fecha_vencimiento] DATE NULL,
  CONSTRAINT [PK__ComprasD__3213E83F2E5E8F2E] PRIMARY KEY ([id])
);

CREATE TABLE [Configuracion] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [temporada_id] INT NOT NULL,
  [forma_pago] NVARCHAR(20) NULL DEFAULT ('kilo'),
  [jornal_base] DECIMAL(10,2) NULL,
  [frecuencia_pago] NVARCHAR(20) NULL DEFAULT ('quincenal'),
  [permite_anticipos] BIT NULL DEFAULT ((1)),
  [observacion] NVARCHAR(200) NULL,
  CONSTRAINT [PK__Configur__3213E83F01859A6A] PRIMARY KEY ([id])
);

CREATE TABLE [ConfiguracionEmpresa] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [razon_social] NVARCHAR(200) NULL,
  [cuit] NVARCHAR(20) NULL,
  [rne] NVARCHAR(50) NULL,
  [rnpa] NVARCHAR(50) NULL,
  [renspa] NVARCHAR(50) NULL,
  [direccion] NVARCHAR(300) NULL,
  [localidad] NVARCHAR(100) NULL,
  [provincia] NVARCHAR(100) NULL,
  [telefono] NVARCHAR(50) NULL,
  [email] NVARCHAR(100) NULL,
  [logo_url] NVARCHAR(300) NULL,
  [observacion] NVARCHAR(500) NULL,
  [actualizado_en] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__Configur__3213E83FC7A55736] PRIMARY KEY ([id])
);

CREATE TABLE [CuentaCorrienteClientes] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [cliente_id] INT NOT NULL,
  [tipo] NVARCHAR(10) NOT NULL,
  [monto] DECIMAL(12,2) NOT NULL,
  [forma_pago_id] INT NULL,
  [cheque_id] INT NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [observacion] NVARCHAR(200) NULL,
  [temporada_id] INT NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  [movimiento_deposito_id] INT NULL,
  [nota_credito_id] INT NULL,
  CONSTRAINT [PK__CuentaCo__3213E83F29E173B2] PRIMARY KEY ([id])
);

CREATE TABLE [CuentaCorrienteProveedores] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [proveedor_id] INT NOT NULL,
  [tipo] NVARCHAR(10) NOT NULL,
  [monto] DECIMAL(12,2) NOT NULL,
  [forma_pago_id] INT NULL,
  [cheque_id] INT NULL,
  [compra_id] INT NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [observacion] NVARCHAR(200) NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [temporada_id] INT NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  CONSTRAINT [PK__CuentaCo__3213E83F70F79813] PRIMARY KEY ([id])
);

CREATE TABLE [Depositos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [tipo] NVARCHAR(50) NOT NULL,
  [capacidad_kg] DECIMAL(12,2) NULL,
  [costo_kg_dia] DECIMAL(10,4) NULL,
  [ubicacion] NVARCHAR(200) NULL,
  [observacion] NVARCHAR(200) NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [tipo_stock] NVARCHAR(20) NOT NULL DEFAULT ('mercaderia'),
  [requiere_despalillado] BIT NOT NULL DEFAULT ((0)),
  [tipo_deposito] NVARCHAR(20) NULL,
  CONSTRAINT [PK__Deposito__3213E83F2EB5CC89] PRIMARY KEY ([id]),
  CONSTRAINT [CK_Depositos_tipo_stock] CHECK ([tipo_stock]='mixto' OR [tipo_stock]='insumos' OR [tipo_stock]='mercaderia')
);

CREATE TABLE [Despalillado] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [parcela_id] INT NULL,
  [despalillador_id] INT NOT NULL,
  [kilos] DECIMAL(10,3) NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [operador] NVARCHAR(50) NULL,
  [juntada_id] INT NULL,
  [deposito_id] INT NULL,
  [merma_kg] DECIMAL(10,3) NULL,
  [merma_pct] DECIMAL(5,2) NULL,
  [usuario_id] INT NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  [lote_id] INT NULL,
  [stock_pendiente_clasificacion] BIT NOT NULL DEFAULT ((0)),
  CONSTRAINT [PK__Despalil__3213E83F1C9068CE] PRIMARY KEY ([id])
);

CREATE TABLE [EdicionesHistorial] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [tabla] NVARCHAR(50) NOT NULL,
  [registro_id] INT NOT NULL,
  [campo] NVARCHAR(50) NOT NULL,
  [valor_anterior] NVARCHAR(100) NULL,
  [valor_nuevo] NVARCHAR(100) NULL,
  [usuario_id] INT NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [motivo] NVARCHAR(200) NULL,
  CONSTRAINT [PK__Edicione__3213E83FC38E573B] PRIMARY KEY ([id])
);

CREATE TABLE [Embalaje] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [clasificacion_id] INT NULL,
  [sub_lote_id] INT NOT NULL,
  [kilos] DECIMAL(10,3) NOT NULL,
  [tipo_envase] NVARCHAR(100) NULL,
  [cantidad_envases] INT NOT NULL DEFAULT ((1)),
  [destino] NVARCHAR(50) NULL,
  [deposito_id] INT NULL,
  [empleado_id] INT NULL,
  [fecha_hora] DATETIME NOT NULL DEFAULT (getdate()),
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  [usuario_id] INT NULL,
  [fecha_envasado] DATETIME NULL DEFAULT (getdate()),
  [producto_id] INT NULL,
  [tipo_embalaje_id] INT NULL,
  CONSTRAINT [PK__Embalaje__3213E83FF91DE395] PRIMARY KEY ([id])
);

CREATE TABLE [FormasPago] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(50) NOT NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [es_cuenta_corriente] BIT NOT NULL DEFAULT ((0)),
  CONSTRAINT [PK__FormasPa__3213E83F3B753A6C] PRIMARY KEY ([id])
);

CREATE TABLE [Gastos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [temporada_id] INT NOT NULL,
  [parcela_id] INT NULL,
  [categoria_id] INT NOT NULL,
  [concepto] NVARCHAR(200) NOT NULL,
  [monto] DECIMAL(12,2) NOT NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [forma_pago_id] INT NULL,
  [proveedor_id] INT NULL,
  [observacion] NVARCHAR(200) NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  CONSTRAINT [PK__Gastos__3213E83FA38EC38F] PRIMARY KEY ([id])
);

CREATE TABLE [Juntada] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [parcela_id] INT NOT NULL,
  [juntador_id] INT NOT NULL,
  [kilos] DECIMAL(10,3) NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [operador] NVARCHAR(50) NULL,
  [observacion] NVARCHAR(200) NULL,
  [deposito_id] INT NULL,
  [destino] NVARCHAR(20) NULL,
  [precio_venta_directa] DECIMAL(10,2) NULL,
  [comprador_directo] NVARCHAR(100) NULL,
  [stock_pendiente] BIT NOT NULL DEFAULT ((0)),
  [usuario_id] INT NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  [lote_id] INT NULL,
  [carencia_advertida] BIT NULL DEFAULT ((0)),
  CONSTRAINT [PK__Juntada__3213E83F1898F274] PRIMARY KEY ([id])
);

CREATE TABLE [JuntadaDestino] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [juntada_id] INT NOT NULL,
  [tipo] NVARCHAR(30) NOT NULL,
  [deposito_id] INT NULL,
  [kilos] DECIMAL(10,3) NULL,
  [stock_pendiente] BIT NOT NULL DEFAULT ((0)),
  [precio_kilo] DECIMAL(10,2) NULL,
  [comprador] NVARCHAR(200) NULL,
  [motivo] NVARCHAR(500) NULL,
  CONSTRAINT [PK__JuntadaD__3213E83FA9064725] PRIMARY KEY ([id])
);

CREATE TABLE [Juntadores] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [apellido] NVARCHAR(100) NULL,
  [qr_codigo] NVARCHAR(50) NOT NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [tipo] NVARCHAR(30) NULL DEFAULT ('juntador'),
  [personal_id] INT NULL,
  CONSTRAINT [PK__Juntador__3213E83FC45755C4] PRIMARY KEY ([id])
);

CREATE TABLE [LoteClasificadores] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [lote_id] INT NOT NULL,
  [empleado_id] INT NOT NULL,
  [hora_inicio] DATETIME NULL,
  [hora_fin] DATETIME NULL,
  [fecha_asignacion] DATETIME NULL DEFAULT (getdate()),
  [fecha] DATE NOT NULL DEFAULT (CONVERT([date],getdate())),
  CONSTRAINT [PK__LoteClas__3213E83F05552AF9] PRIMARY KEY ([id])
);

CREATE TABLE [LoteCosecheros] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [lote_id] INT NOT NULL,
  [juntador_id] INT NOT NULL,
  [fecha_asignacion] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__LoteCose__3213E83F12A94F93] PRIMARY KEY ([id])
);

CREATE TABLE [LoteDespalilladores] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [lote_id] INT NOT NULL,
  [despalillador_id] INT NOT NULL,
  [fecha_asignacion] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__LoteDesp__3213E83F4D9846AB] PRIMARY KEY ([id])
);

CREATE TABLE [LotesMercaderia] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [codigo_interno] NVARCHAR(60) NOT NULL,
  [codigo_externo] NVARCHAR(50) NULL,
  [lote_padre_id] INT NULL,
  [temporada_id] INT NOT NULL,
  [parcela_id] INT NULL,
  [categoria_id] INT NULL,
  [deposito_id] INT NULL,
  [destino] NVARCHAR(20) NULL,
  [kilos] DECIMAL(10,3) NOT NULL DEFAULT ((0)),
  [etapa] NVARCHAR(20) NOT NULL DEFAULT ('cosecha'),
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('abierto'),
  [fecha_inicio] DATETIME NOT NULL DEFAULT (getdate()),
  [fecha_fin] DATETIME NULL,
  [usuario_id] INT NULL,
  [observacion] NVARCHAR(500) NULL,
  [kilos_en_camara] DECIMAL(10,3) NOT NULL DEFAULT ((0)),
  [deposito_camara_id] INT NULL,
  [merma_despalillado] DECIMAL(10,3) NOT NULL DEFAULT ((0)),
  [categoria_clasif_id] INT NULL,
  [sub_categoria_id] INT NULL,
  [fecha_envasado] DATETIME NULL,
  [deposito_actual_id] INT NULL,
  CONSTRAINT [PK__LotesMer__3213E83F11E935AD] PRIMARY KEY ([id])
);

CREATE TABLE [MovimientosDeposito] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [deposito_id] INT NULL,
  [temporada_id] INT NOT NULL,
  [parcela_id] INT NULL,
  [tipo] NVARCHAR(20) NOT NULL,
  [kilos] DECIMAL(10,3) NULL,
  [precio_kilo] DECIMAL(10,2) NULL,
  [comprador] NVARCHAR(100) NULL,
  [destino_venta] NVARCHAR(50) NULL,
  [fecha] DATETIME NULL DEFAULT (getdate()),
  [observacion] NVARCHAR(200) NULL,
  [juntada_id] INT NULL,
  [juntador_id] INT NULL,
  [usuario_id] INT NULL,
  [cliente_id] INT NULL,
  [variedad] NVARCHAR(100) NULL,
  [forma_pago_id] INT NULL,
  [estado_cobro] NVARCHAR(20) NULL DEFAULT ('cobrado'),
  [numero_remito] NVARCHAR(20) NULL,
  [remito_id] INT NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('confirmada'),
  [lote_id] INT NULL,
  [sub_lote_id] INT NULL,
  [tipo_embalaje_id] INT NULL,
  [cantidad_envases] INT NULL,
  CONSTRAINT [PK__Movimien__3213E83FD6EE262B] PRIMARY KEY ([id]),
  CONSTRAINT [CK_MovimientosDeposito_tipo] CHECK ([tipo]='egreso_venta' OR [tipo]='egreso_despalillado' OR [tipo]='egreso_descarte' OR [tipo]='egreso_anulacion' OR [tipo]='ingreso_juntada' OR [tipo]='ingreso_embalaje' OR [tipo]='ingreso_devolucion' OR [tipo]='ingreso_anulacion' OR [tipo]='ingreso')
);

CREATE TABLE [NotaCreditoItems] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nota_credito_id] INT NOT NULL,
  [remito_item_id] INT NOT NULL,
  [sub_lote_id] INT NOT NULL,
  [kg_devueltos] DECIMAL(18,3) NOT NULL,
  [precio_unitario] DECIMAL(18,2) NOT NULL,
  [subtotal] DECIMAL(18,2) NOT NULL,
  [destino] NVARCHAR(30) NOT NULL,
  [categoria_destino_id] INT NULL,
  [subcategoria_destino_id] INT NULL,
  [movimiento_deposito_id] INT NULL,
  [observacion] NVARCHAR(500) NULL,
  CONSTRAINT [PK__NotaCred__3213E83FF1748FB4] PRIMARY KEY ([id]),
  CONSTRAINT [CK_NCI_destino] CHECK ([destino]='merma' OR [destino]='reingreso_recategorizado' OR [destino]='reingreso_misma'),
  CONSTRAINT [CK_NCI_kg_positivo] CHECK ([kg_devueltos]>(0))
);

CREATE TABLE [NotasCredito] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [numero] NVARCHAR(20) NOT NULL,
  [remito_id] INT NOT NULL,
  [cliente_id] INT NOT NULL,
  [temporada_id] INT NULL,
  [fecha_emision] DATETIME NOT NULL DEFAULT (getdate()),
  [motivo] NVARCHAR(500) NULL,
  [monto_total] DECIMAL(18,2) NOT NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('emitida'),
  [forma_pago_reembolso_id] INT NULL,
  [fecha_reembolso] DATETIME NULL,
  [referencia_reembolso] NVARCHAR(200) NULL,
  [caja_movimiento_id] INT NULL,
  [cuenta_corriente_id] INT NULL,
  [usuario_id] INT NOT NULL,
  [fecha_anulacion] DATETIME NULL,
  [motivo_anulacion] NVARCHAR(500) NULL,
  CONSTRAINT [PK__NotasCre__3213E83FFFF90022] PRIMARY KEY ([id]),
  CONSTRAINT [CK_NC_estado] CHECK ([estado]='anulada' OR [estado]='con_reembolso' OR [estado]='emitida')
);

CREATE TABLE [Pagos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [juntador_id] INT NOT NULL,
  [monto] DECIMAL(10,2) NOT NULL,
  [tipo] NVARCHAR(50) NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [observacion] NVARCHAR(200) NULL,
  [periodo_desde] DATE NULL,
  [periodo_hasta] DATE NULL,
  [kilos_liquidados] DECIMAL(10,2) NULL,
  [precio_kilo] DECIMAL(10,2) NULL,
  [jornal_dias] INT NULL,
  [anticipos] DECIMAL(10,2) NULL DEFAULT ((0)),
  [total_bruto] DECIMAL(10,2) NULL,
  [saldo_final] DECIMAL(10,2) NULL,
  [forma_pago_id] INT NULL,
  [cheque_id] INT NULL,
  [estado_pago] VARCHAR(20) NULL DEFAULT ('pendiente'),
  [numero_recibo] VARCHAR(20) NULL,
  [forma_pago] VARCHAR(20) NULL,
  [referencia_transferencia] VARCHAR(100) NULL,
  [comprobante_path] VARCHAR(255) NULL,
  [actividad_origen] VARCHAR(30) NULL,
  [monto_total] DECIMAL(12,2) NULL DEFAULT ((0)),
  [monto_pagado] DECIMAL(12,2) NULL DEFAULT ((0)),
  [usuario_id] INT NULL,
  CONSTRAINT [PK__Pagos__3213E83F682A172B] PRIMARY KEY ([id]),
  CONSTRAINT [CK_Pagos_estado_pago] CHECK ([estado_pago]='pagado' OR [estado_pago]='pago_parcial' OR [estado_pago]='pendiente'),
  CONSTRAINT [CK_Pagos_forma_pago] CHECK ([forma_pago]='mixto' OR [forma_pago]='transferencia' OR [forma_pago]='efectivo')
);

CREATE TABLE [Parcelas] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [hectareas] DECIMAL(6,2) NULL,
  [temporada_id] INT NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [cantidad_plantines] INT NULL,
  [destino_fruta] NVARCHAR(50) NULL,
  [variedad_id] INT NULL,
  CONSTRAINT [PK__Lotes__3213E83F1EEDC4E2] PRIMARY KEY ([id])
);

CREATE TABLE [PermisosRol] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [rol] NVARCHAR(20) NOT NULL,
  [permiso] NVARCHAR(50) NOT NULL,
  [habilitado] BIT NOT NULL DEFAULT ((1)),
  CONSTRAINT [PK__Permisos__3213E83F578007A7] PRIMARY KEY ([id])
);

CREATE TABLE [Personal] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [apellido] NVARCHAR(100) NOT NULL,
  [tipo_documento] NVARCHAR(20) NULL DEFAULT ('DNI'),
  [documento] NVARCHAR(20) NULL,
  [cuil] NVARCHAR(15) NULL,
  [fecha_nacimiento] DATE NULL,
  [nacionalidad] NVARCHAR(50) NULL,
  [telefono] NVARCHAR(30) NULL,
  [email] NVARCHAR(100) NULL,
  [direccion] NVARCHAR(200) NULL,
  [localidad] NVARCHAR(100) NULL,
  [tipo_contrato] NVARCHAR(50) NULL,
  [fecha_ingreso] DATE NULL,
  [fecha_egreso] DATE NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [observaciones] NVARCHAR(500) NULL,
  [juntador_id] INT NULL,
  [creado_en] DATETIME NULL DEFAULT (getdate()),
  [qr_codigo] NVARCHAR(100) NULL,
  CONSTRAINT [PK__Personal__3213E83FBADF252B] PRIMARY KEY ([id])
);

CREATE TABLE [PersonalRoles] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [personal_id] INT NOT NULL,
  [rol] NVARCHAR(30) NOT NULL,
  [activo] BIT NOT NULL DEFAULT ((1)),
  [creado_en] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__Personal__3213E83F9935021E] PRIMARY KEY ([id]),
  CONSTRAINT [CK__PersonalRol__rol__7C1A6C5A] CHECK ([rol]='campo_general' OR [rol]='clasificador' OR [rol]='aplicador' OR [rol]='despalillador' OR [rol]='cosechero')
);

CREATE TABLE [PrecioHistorico] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [temporada_id] INT NOT NULL,
  [precio_kilo] DECIMAL(10,2) NOT NULL,
  [destino] NVARCHAR(50) NULL DEFAULT ('fresco'),
  [fecha_desde] DATE NOT NULL,
  [fecha_hasta] DATE NULL,
  [observacion] NVARCHAR(200) NULL,
  CONSTRAINT [PK__PrecioHi__3213E83FAA5DA516] PRIMARY KEY ([id])
);

CREATE TABLE [PreciosRol] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [temporada_id] INT NOT NULL,
  [actividad] VARCHAR(30) NOT NULL,
  [unidad] VARCHAR(10) NOT NULL,
  [precio] DECIMAL(10,2) NOT NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [created_at] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__PreciosR__3213E83F8ED6C0FD] PRIMARY KEY ([id]),
  CONSTRAINT [CK__PreciosRo__activ__3EA749C6] CHECK ([actividad]='trabajo_campo' OR [actividad]='aplicacion' OR [actividad]='embalaje' OR [actividad]='clasificacion' OR [actividad]='despalillado' OR [actividad]='juntada'),
  CONSTRAINT [CK__PreciosRo__unida__3F9B6DFF] CHECK ([unidad]='hora' OR [unidad]='kilo')
);

CREATE TABLE [Productos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [descripcion] NVARCHAR(200) NULL,
  [tipo] NVARCHAR(50) NULL,
  [presentacion] NVARCHAR(50) NULL,
  [contenido_litros] DECIMAL(8,2) NULL,
  [costo_unitario] DECIMAL(10,2) NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [stock_actual] DECIMAL(10,2) NULL DEFAULT ((0)),
  [proveedor_id] INT NULL,
  [unidad_medida] NVARCHAR(20) NULL,
  [envase] NVARCHAR(30) NULL,
  [stock_minimo] DECIMAL(10,3) NULL,
  [categoria] NVARCHAR(60) NULL,
  CONSTRAINT [PK__Producto__3213E83F33455928] PRIMARY KEY ([id])
);

CREATE TABLE [Proveedores] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [rubro] NVARCHAR(50) NULL,
  [contacto] NVARCHAR(100) NULL,
  [telefono] NVARCHAR(50) NULL,
  [email] NVARCHAR(100) NULL,
  [direccion] NVARCHAR(200) NULL,
  [activo] BIT NULL DEFAULT ((1)),
  CONSTRAINT [PK__Proveedo__3213E83F2E88D38F] PRIMARY KEY ([id])
);

CREATE TABLE [RemitoItems] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [remito_id] INT NOT NULL,
  [movimiento_id] INT NULL,
  [deposito_id] INT NULL,
  [variedad] NVARCHAR(100) NULL,
  [kilos] DECIMAL(10,2) NOT NULL,
  [precio_kilo] DECIMAL(10,2) NULL,
  [subtotal] DECIMAL(12,2) NULL,
  [sub_lote_id] INT NULL,
  CONSTRAINT [PK__RemitoIt__3213E83F3FDB00C4] PRIMARY KEY ([id])
);

CREATE TABLE [Remitos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [numero] NVARCHAR(20) NOT NULL,
  [fecha] DATETIME NULL DEFAULT (getdate()),
  [cliente_id] INT NULL,
  [temporada_id] INT NULL,
  [forma_pago_id] INT NULL,
  [estado] NVARCHAR(20) NOT NULL DEFAULT ('cobrado'),
  [total] DECIMAL(12,2) NULL,
  [kilos_total] DECIMAL(10,2) NULL,
  [destino] NVARCHAR(200) NULL,
  [observacion] NVARCHAR(500) NULL,
  [usuario_nombre] NVARCHAR(100) NULL,
  [creado_en] DATETIME NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK__Remitos__3213E83F2A2580CD] PRIMARY KEY ([id])
);

CREATE TABLE [StockInsumos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [producto_id] INT NOT NULL,
  [tipo] NVARCHAR(20) NOT NULL,
  [cantidad] DECIMAL(10,3) NOT NULL,
  [costo_total] DECIMAL(10,2) NULL,
  [fecha] DATE NULL DEFAULT (getdate()),
  [proveedor] NVARCHAR(100) NULL,
  [parcela_id] INT NULL,
  [observacion] NVARCHAR(200) NULL,
  [fecha_hora] DATETIME NULL DEFAULT (getdate()),
  [usuario_id] INT NULL,
  [empleado_id] INT NULL,
  [aplicacion_id] INT NULL,
  [deposito_id] INT NULL,
  [fecha_vencimiento] DATE NULL,
  [compra_id] INT NULL,
  CONSTRAINT [PK__StockIns__3213E83FB36D2088] PRIMARY KEY ([id])
);

CREATE TABLE [SubCategoriasClasificacion] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [categoria_padre_id] INT NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [codigo] NVARCHAR(10) NOT NULL,
  [activo] BIT NULL DEFAULT ((1)),
  [fecha_creacion] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__SubCateg__3213E83F3F415FE2] PRIMARY KEY ([id])
);

CREATE TABLE [TareaInsumos] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [tarea_id] INT NOT NULL,
  [producto_id] INT NOT NULL,
  [cantidad] DECIMAL(10,2) NOT NULL,
  [costo] DECIMAL(10,2) NULL DEFAULT ((0)),
  [created_at] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__TareaIns__3213E83F18506FCC] PRIMARY KEY ([id])
);

CREATE TABLE [TareasGenerales] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [temporada_id] INT NOT NULL,
  [parcela_id] INT NULL,
  [categoria_tarea_id] INT NOT NULL,
  [descripcion] VARCHAR(500) NULL,
  [observacion] VARCHAR(500) NULL,
  [fecha] DATE NOT NULL DEFAULT (CONVERT([date],getdate())),
  [estado] VARCHAR(20) NULL DEFAULT ('confirmada'),
  [costo_total] DECIMAL(12,2) NULL DEFAULT ((0)),
  [usuario_id] INT NULL,
  [created_at] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__TareasGe__3213E83FCAC04976] PRIMARY KEY ([id]),
  CONSTRAINT [CK__TareasGen__estad__2B947552] CHECK ([estado]='anulada' OR [estado]='confirmada')
);

CREATE TABLE [TareaTrabajadores] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [tarea_id] INT NOT NULL,
  [trabajador_id] INT NOT NULL,
  [hora_inicio] DATETIME NULL,
  [hora_fin] DATETIME NULL,
  [monto] DECIMAL(10,2) NULL DEFAULT ((0)),
  [created_at] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__TareaTra__3213E83FD8992D4B] PRIMARY KEY ([id])
);

CREATE TABLE [Temporadas] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(50) NOT NULL,
  [tipo] NVARCHAR(50) NULL,
  [fecha_inicio] DATE NULL,
  [fecha_fin] DATE NULL,
  [activa] BIT NULL DEFAULT ((1)),
  [cultivo] NVARCHAR(50) NULL,
  [descripcion] NVARCHAR(200) NULL,
  CONSTRAINT [PK__Temporad__3213E83FDE261989] PRIMARY KEY ([id])
);

CREATE TABLE [TiposEmbalaje] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [peso_kg] DECIMAL(10,3) NOT NULL,
  [activo] BIT NOT NULL DEFAULT ((1)),
  [created_at] DATETIME NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK__TiposEmb__3213E83FB4E172D9] PRIMARY KEY ([id])
);

CREATE TABLE [Usuarios] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [usuario] NVARCHAR(50) NOT NULL,
  [password_hash] NVARCHAR(255) NOT NULL,
  [rol] NVARCHAR(20) NOT NULL DEFAULT ('encargado'),
  [activo] BIT NULL DEFAULT ((1)),
  [creado_en] DATETIME NULL DEFAULT (getdate()),
  CONSTRAINT [PK__Usuarios__3213E83F42794249] PRIMARY KEY ([id])
);

CREATE TABLE [variedades_frutilla] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [nombre] NVARCHAR(100) NOT NULL,
  [activa] BIT NOT NULL DEFAULT ((1)),
  CONSTRAINT [PK__variedad__3213E83F0236CD7D] PRIMARY KEY ([id])
);

CREATE TABLE [VentaEmbalaje] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [movimiento_id] INT NOT NULL,
  [producto_id] INT NOT NULL,
  [cantidad] DECIMAL(10,2) NOT NULL DEFAULT ((0)),
  [costo_unitario] DECIMAL(10,2) NOT NULL DEFAULT ((0)),
  [costo_total] DECIMAL(10,2) NOT NULL DEFAULT ((0)),
  [retornable] BIT NOT NULL DEFAULT ((0)),
  [cantidad_devuelta] DECIMAL(10,2) NOT NULL DEFAULT ((0)),
  [fecha_creacion] DATETIME NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK__VentaEmb__3213E83FC7FD2223] PRIMARY KEY ([id])
);

-- ══ FOREIGN KEYS ══

ALTER TABLE [AplicacionEmpleados] ADD CONSTRAINT [FK__Aplicacio__aplic__1F2E9E6D] FOREIGN KEY ([aplicacion_id]) REFERENCES [Aplicaciones]([id]);
ALTER TABLE [AplicacionEmpleados] ADD CONSTRAINT [FK__Aplicacio__emple__2022C2A6] FOREIGN KEY ([empleado_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [Aplicaciones] ADD CONSTRAINT [FK__Aplicacio__emple__18EBB532] FOREIGN KEY ([empleado_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [Aplicaciones] ADD CONSTRAINT [FK__Aplicacio__produ__5070F446] FOREIGN KEY ([producto_id]) REFERENCES [Productos]([id]);
ALTER TABLE [Aplicaciones] ADD CONSTRAINT [FK__Aplicacio__tempo__17F790F9] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [Aplicaciones] ADD CONSTRAINT [FK_Aplicaciones_parcela_id] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [Aplicaciones] ADD CONSTRAINT [FK_Aplicaciones_Usuario] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [AuditoriaClasificacion] ADD CONSTRAINT [FK__Auditoria__usuar__12C8C788] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [Caja] ADD CONSTRAINT [FK__Caja__cheque_id__02084FDA] FOREIGN KEY ([cheque_id]) REFERENCES [Cheques]([id]);
ALTER TABLE [Caja] ADD CONSTRAINT [FK__Caja__forma_pago__01142BA1] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [Caja] ADD CONSTRAINT [FK__Caja__temporada___03F0984C] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [ChequeMovimientos] ADD CONSTRAINT [FK_CheqMov_Cheque] FOREIGN KEY ([cheque_id]) REFERENCES [Cheques]([id]);
ALTER TABLE [Cheques] ADD CONSTRAINT [FK__Cheques__proveed__7E37BEF6] FOREIGN KEY ([proveedor_id]) REFERENCES [Proveedores]([id]);
ALTER TABLE [Clasificacion] ADD CONSTRAINT [FK__Clasifica__categ__038683F8] FOREIGN KEY ([categoria_clasif_id]) REFERENCES [CategoriasClasificacion]([id]);
ALTER TABLE [Clasificacion] ADD CONSTRAINT [FK__Clasifica__sub_c__047AA831] FOREIGN KEY ([sub_categoria_id]) REFERENCES [SubCategoriasClasificacion]([id]);
ALTER TABLE [Clasificacion] ADD CONSTRAINT [FK_Clasif_Despalillado] FOREIGN KEY ([despalillado_id]) REFERENCES [Despalillado]([id]);
ALTER TABLE [Clasificacion] ADD CONSTRAINT [FK_Clasif_Empleado] FOREIGN KEY ([empleado_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [Clasificacion] ADD CONSTRAINT [FK_Clasif_Lote] FOREIGN KEY ([lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [Clasificacion] ADD CONSTRAINT [FK_Clasif_SubLote] FOREIGN KEY ([sub_lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [Clasificacion] ADD CONSTRAINT [FK_Clasif_Usuario] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [Compras] ADD CONSTRAINT [FK__Compras__cheque___151B244E] FOREIGN KEY ([cheque_id]) REFERENCES [Cheques]([id]);
ALTER TABLE [Compras] ADD CONSTRAINT [FK__Compras__forma_p__14270015] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [Compras] ADD CONSTRAINT [FK__Compras__proveed__66603565] FOREIGN KEY ([proveedor_id]) REFERENCES [Proveedores]([id]);
ALTER TABLE [Compras] ADD CONSTRAINT [FK__Compras__tempora__6754599E] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [ComprasDetalle] ADD CONSTRAINT [FK__ComprasDe__compr__6B24EA82] FOREIGN KEY ([compra_id]) REFERENCES [Compras]([id]);
ALTER TABLE [ComprasDetalle] ADD CONSTRAINT [FK__ComprasDe__produ__6C190EBB] FOREIGN KEY ([producto_id]) REFERENCES [Productos]([id]);
ALTER TABLE [Configuracion] ADD CONSTRAINT [FK__Configura__tempo__6EF57B66] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [CuentaCorrienteClientes] ADD CONSTRAINT [FK__CuentaCor__chequ__123EB7A3] FOREIGN KEY ([cheque_id]) REFERENCES [Cheques]([id]);
ALTER TABLE [CuentaCorrienteClientes] ADD CONSTRAINT [FK__CuentaCor__clien__10566F31] FOREIGN KEY ([cliente_id]) REFERENCES [Clientes]([id]);
ALTER TABLE [CuentaCorrienteClientes] ADD CONSTRAINT [FK__CuentaCor__forma__114A936A] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [CuentaCorrienteClientes] ADD CONSTRAINT [FK__CuentaCor__tempo__59C55456] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [CuentaCorrienteClientes] ADD CONSTRAINT [FK_CC_MovimientosDeposito] FOREIGN KEY ([movimiento_deposito_id]) REFERENCES [MovimientosDeposito]([id]);
ALTER TABLE [CuentaCorrienteProveedores] ADD CONSTRAINT [FK__CuentaCor__chequ__08B54D69] FOREIGN KEY ([cheque_id]) REFERENCES [Cheques]([id]);
ALTER TABLE [CuentaCorrienteProveedores] ADD CONSTRAINT [FK__CuentaCor__compr__09A971A2] FOREIGN KEY ([compra_id]) REFERENCES [Compras]([id]);
ALTER TABLE [CuentaCorrienteProveedores] ADD CONSTRAINT [FK__CuentaCor__forma__07C12930] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [CuentaCorrienteProveedores] ADD CONSTRAINT [FK__CuentaCor__prove__06CD04F7] FOREIGN KEY ([proveedor_id]) REFERENCES [Proveedores]([id]);
ALTER TABLE [CuentaCorrienteProveedores] ADD CONSTRAINT [FK__CuentaCor__tempo__5CA1C101] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [Despalillado] ADD CONSTRAINT [FK__Despalill__despa__47DBAE45] FOREIGN KEY ([despalillador_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [Despalillado] ADD CONSTRAINT [FK_Despalillado_Deposito] FOREIGN KEY ([deposito_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [Despalillado] ADD CONSTRAINT [FK_Despalillado_Juntada] FOREIGN KEY ([juntada_id]) REFERENCES [Juntada]([id]);
ALTER TABLE [Despalillado] ADD CONSTRAINT [FK_Despalillado_Lote] FOREIGN KEY ([lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [Despalillado] ADD CONSTRAINT [FK_Despalillado_parcela_id] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [Despalillado] ADD CONSTRAINT [FK_Despalillado_Usuario] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [EdicionesHistorial] ADD CONSTRAINT [FK__Ediciones__usuar__603D47BB] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [Embalaje] ADD CONSTRAINT [FK__Embalaje__produc__0FEC5ADD] FOREIGN KEY ([producto_id]) REFERENCES [Productos]([id]);
ALTER TABLE [Embalaje] ADD CONSTRAINT [FK_Embalaje_Clasif] FOREIGN KEY ([clasificacion_id]) REFERENCES [Clasificacion]([id]);
ALTER TABLE [Embalaje] ADD CONSTRAINT [FK_Embalaje_Deposito] FOREIGN KEY ([deposito_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [Embalaje] ADD CONSTRAINT [FK_Embalaje_Empleado] FOREIGN KEY ([empleado_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [Embalaje] ADD CONSTRAINT [FK_Embalaje_SubLote] FOREIGN KEY ([sub_lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [Embalaje] ADD CONSTRAINT [FK_Embalaje_TiposEmbalaje] FOREIGN KEY ([tipo_embalaje_id]) REFERENCES [TiposEmbalaje]([id]);
ALTER TABLE [Embalaje] ADD CONSTRAINT [FK_Embalaje_Usuario] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [Gastos] ADD CONSTRAINT [FK__Gastos__categori__22751F6C] FOREIGN KEY ([categoria_id]) REFERENCES [CategoriasGasto]([id]);
ALTER TABLE [Gastos] ADD CONSTRAINT [FK__Gastos__forma_pa__245D67DE] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [Gastos] ADD CONSTRAINT [FK__Gastos__proveedo__25518C17] FOREIGN KEY ([proveedor_id]) REFERENCES [Proveedores]([id]);
ALTER TABLE [Gastos] ADD CONSTRAINT [FK__Gastos__temporad__208CD6FA] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [Gastos] ADD CONSTRAINT [FK_Gastos_parcela_id] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [Juntada] ADD CONSTRAINT [FK__Juntada__deposit__367C1819] FOREIGN KEY ([deposito_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [Juntada] ADD CONSTRAINT [FK__Juntada__juntado__4316F928] FOREIGN KEY ([juntador_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [Juntada] ADD CONSTRAINT [FK_Juntada_Lote] FOREIGN KEY ([lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [Juntada] ADD CONSTRAINT [FK_Juntada_parcela_id] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [Juntada] ADD CONSTRAINT [FK_Juntada_Usuario] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [JuntadaDestino] ADD CONSTRAINT [FK_JuntadaDestino_Deposito] FOREIGN KEY ([deposito_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [JuntadaDestino] ADD CONSTRAINT [FK_JuntadaDestino_Juntada] FOREIGN KEY ([juntada_id]) REFERENCES [Juntada]([id]);
ALTER TABLE [Juntadores] ADD CONSTRAINT [FK_Juntadores_Personal] FOREIGN KEY ([personal_id]) REFERENCES [Personal]([id]);
ALTER TABLE [LoteClasificadores] ADD CONSTRAINT [FK__LoteClasi__emple__0C1BC9F9] FOREIGN KEY ([empleado_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [LoteClasificadores] ADD CONSTRAINT [FK__LoteClasi__lote___0B27A5C0] FOREIGN KEY ([lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [LoteCosecheros] ADD CONSTRAINT [FK__LoteCosec__junta__65F62111] FOREIGN KEY ([juntador_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [LoteCosecheros] ADD CONSTRAINT [FK__LoteCosec__lote___6501FCD8] FOREIGN KEY ([lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [LoteDespalilladores] ADD CONSTRAINT [FK__LoteDespa__despa__6BAEFA67] FOREIGN KEY ([despalillador_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [LoteDespalilladores] ADD CONSTRAINT [FK__LoteDespa__lote___6ABAD62E] FOREIGN KEY ([lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK__LotesMerc__categ__056ECC6A] FOREIGN KEY ([categoria_clasif_id]) REFERENCES [CategoriasClasificacion]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK__LotesMerc__sub_c__0662F0A3] FOREIGN KEY ([sub_categoria_id]) REFERENCES [SubCategoriasClasificacion]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_Lotes_Categoria] FOREIGN KEY ([categoria_id]) REFERENCES [CategoriasFruta]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_Lotes_DepCamara] FOREIGN KEY ([deposito_camara_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_Lotes_Deposito] FOREIGN KEY ([deposito_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_Lotes_Padre] FOREIGN KEY ([lote_padre_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_Lotes_Parcela] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_Lotes_Temporada] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_Lotes_Usuario] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [LotesMercaderia] ADD CONSTRAINT [FK_LotesMerc_DepActual] FOREIGN KEY ([deposito_actual_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK__Movimient__depos__32AB8735] FOREIGN KEY ([deposito_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK__Movimient__forma__19AACF41] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK__Movimient__remit__2704CA5F] FOREIGN KEY ([remito_id]) REFERENCES [Remitos]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK__Movimient__tempo__339FAB6E] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK_MovDep_Cliente] FOREIGN KEY ([cliente_id]) REFERENCES [Clientes]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK_MovDep_Lote] FOREIGN KEY ([lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK_MovDep_SubLote] FOREIGN KEY ([sub_lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK_MovimientosDeposito_parcela_id] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [MovimientosDeposito] ADD CONSTRAINT [FK_MovimientosDeposito_TiposEmbalaje] FOREIGN KEY ([tipo_embalaje_id]) REFERENCES [TiposEmbalaje]([id]);
ALTER TABLE [NotaCreditoItems] ADD CONSTRAINT [FK_NCI_CatDestino] FOREIGN KEY ([categoria_destino_id]) REFERENCES [CategoriasClasificacion]([id]);
ALTER TABLE [NotaCreditoItems] ADD CONSTRAINT [FK_NCI_NC] FOREIGN KEY ([nota_credito_id]) REFERENCES [NotasCredito]([id]);
ALTER TABLE [NotaCreditoItems] ADD CONSTRAINT [FK_NCI_RemitoItem] FOREIGN KEY ([remito_item_id]) REFERENCES [RemitoItems]([id]);
ALTER TABLE [NotaCreditoItems] ADD CONSTRAINT [FK_NCI_SubCatDestino] FOREIGN KEY ([subcategoria_destino_id]) REFERENCES [SubCategoriasClasificacion]([id]);
ALTER TABLE [NotaCreditoItems] ADD CONSTRAINT [FK_NCI_SubLote] FOREIGN KEY ([sub_lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [NotasCredito] ADD CONSTRAINT [FK_NC_Cliente] FOREIGN KEY ([cliente_id]) REFERENCES [Clientes]([id]);
ALTER TABLE [NotasCredito] ADD CONSTRAINT [FK_NC_FormaPago] FOREIGN KEY ([forma_pago_reembolso_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [NotasCredito] ADD CONSTRAINT [FK_NC_Remito] FOREIGN KEY ([remito_id]) REFERENCES [Remitos]([id]);
ALTER TABLE [NotasCredito] ADD CONSTRAINT [FK_NC_Usuario] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [Pagos] ADD CONSTRAINT [FK__Pagos__cheque_id__17036CC0] FOREIGN KEY ([cheque_id]) REFERENCES [Cheques]([id]);
ALTER TABLE [Pagos] ADD CONSTRAINT [FK__Pagos__forma_pag__160F4887] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [Pagos] ADD CONSTRAINT [FK__Pagos__juntador___5441852A] FOREIGN KEY ([juntador_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [Parcelas] ADD CONSTRAINT [FK__Lotes__temporada__3A81B327] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [Parcelas] ADD CONSTRAINT [FK_Parcelas_Variedad] FOREIGN KEY ([variedad_id]) REFERENCES [variedades_frutilla]([id]);
ALTER TABLE [PersonalRoles] ADD CONSTRAINT [FK_PersonalRoles_Personal] FOREIGN KEY ([personal_id]) REFERENCES [Personal]([id]);
ALTER TABLE [PrecioHistorico] ADD CONSTRAINT [FK__PrecioHis__tempo__74AE54BC] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [PreciosRol] ADD CONSTRAINT [FK__PreciosRo__tempo__3DB3258D] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [Productos] ADD CONSTRAINT [FK__Productos__prove__778AC167] FOREIGN KEY ([proveedor_id]) REFERENCES [Proveedores]([id]);
ALTER TABLE [RemitoItems] ADD CONSTRAINT [FK__RemitoIte__movim__2610A626] FOREIGN KEY ([movimiento_id]) REFERENCES [MovimientosDeposito]([id]);
ALTER TABLE [RemitoItems] ADD CONSTRAINT [FK__RemitoIte__remit__251C81ED] FOREIGN KEY ([remito_id]) REFERENCES [Remitos]([id]);
ALTER TABLE [RemitoItems] ADD CONSTRAINT [FK_RemitoItems_SubLote] FOREIGN KEY ([sub_lote_id]) REFERENCES [LotesMercaderia]([id]);
ALTER TABLE [Remitos] ADD CONSTRAINT [FK__Remitos__cliente__1E6F845E] FOREIGN KEY ([cliente_id]) REFERENCES [Clientes]([id]);
ALTER TABLE [Remitos] ADD CONSTRAINT [FK__Remitos__forma_p__2057CCD0] FOREIGN KEY ([forma_pago_id]) REFERENCES [FormasPago]([id]);
ALTER TABLE [Remitos] ADD CONSTRAINT [FK__Remitos__tempora__1F63A897] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [StockInsumos] ADD CONSTRAINT [FK__StockInsu__produ__59063A47] FOREIGN KEY ([producto_id]) REFERENCES [Productos]([id]);
ALTER TABLE [StockInsumos] ADD CONSTRAINT [FK_StockInsumos_Deposito] FOREIGN KEY ([deposito_id]) REFERENCES [Depositos]([id]);
ALTER TABLE [StockInsumos] ADD CONSTRAINT [FK_StockInsumos_parcela_id] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [SubCategoriasClasificacion] ADD CONSTRAINT [FK__SubCatego__categ__00AA174D] FOREIGN KEY ([categoria_padre_id]) REFERENCES [CategoriasClasificacion]([id]);
ALTER TABLE [TareaInsumos] ADD CONSTRAINT [FK__TareaInsu__produ__37FA4C37] FOREIGN KEY ([producto_id]) REFERENCES [Productos]([id]);
ALTER TABLE [TareaInsumos] ADD CONSTRAINT [FK__TareaInsu__tarea__370627FE] FOREIGN KEY ([tarea_id]) REFERENCES [TareasGenerales]([id]);
ALTER TABLE [TareasGenerales] ADD CONSTRAINT [FK__TareasGen__categ__28B808A7] FOREIGN KEY ([categoria_tarea_id]) REFERENCES [CategoriasTarea]([id]);
ALTER TABLE [TareasGenerales] ADD CONSTRAINT [FK__TareasGen__parce__27C3E46E] FOREIGN KEY ([parcela_id]) REFERENCES [Parcelas]([id]);
ALTER TABLE [TareasGenerales] ADD CONSTRAINT [FK__TareasGen__tempo__26CFC035] FOREIGN KEY ([temporada_id]) REFERENCES [Temporadas]([id]);
ALTER TABLE [TareasGenerales] ADD CONSTRAINT [FK__TareasGen__usuar__2D7CBDC4] FOREIGN KEY ([usuario_id]) REFERENCES [Usuarios]([id]);
ALTER TABLE [TareaTrabajadores] ADD CONSTRAINT [FK__TareaTrab__tarea__314D4EA8] FOREIGN KEY ([tarea_id]) REFERENCES [TareasGenerales]([id]);
ALTER TABLE [TareaTrabajadores] ADD CONSTRAINT [FK__TareaTrab__traba__324172E1] FOREIGN KEY ([trabajador_id]) REFERENCES [Juntadores]([id]);
ALTER TABLE [VentaEmbalaje] ADD CONSTRAINT [FK_VentaEmbalaje_Movimiento] FOREIGN KEY ([movimiento_id]) REFERENCES [MovimientosDeposito]([id]);
ALTER TABLE [VentaEmbalaje] ADD CONSTRAINT [FK_VentaEmbalaje_Producto] FOREIGN KEY ([producto_id]) REFERENCES [Productos]([id]);

-- ══ INDICES ══

CREATE INDEX [IX_AplicacionEmpleados_empleado_id] ON [AplicacionEmpleados] ([empleado_id]);
CREATE INDEX [IX_AplicEmpl_aplic] ON [AplicacionEmpleados] ([aplicacion_id]);
CREATE UNIQUE INDEX [UQ_AplicacionEmpleados] ON [AplicacionEmpleados] ([aplicacion_id], [empleado_id]);
CREATE INDEX [IX_Aplicaciones_empleado_id] ON [Aplicaciones] ([empleado_id]);
CREATE INDEX [IX_Aplicaciones_parcela_id] ON [Aplicaciones] ([parcela_id]);
CREATE INDEX [IX_Aplicaciones_producto_id] ON [Aplicaciones] ([producto_id]);
CREATE INDEX [IX_Aplicaciones_temporada_id] ON [Aplicaciones] ([temporada_id]);
CREATE INDEX [IX_Aplicaciones_usuario_id] ON [Aplicaciones] ([usuario_id]);
CREATE INDEX [IX_AudClas_registro] ON [AuditoriaClasificacion] ([registro_id], [tabla_origen]);
CREATE INDEX [IX_AuditoriaClasificacion_usuario_id] ON [AuditoriaClasificacion] ([usuario_id]);
CREATE INDEX [IX_Caja_cheque_id] ON [Caja] ([cheque_id]);
CREATE INDEX [IX_Caja_forma_pago_id] ON [Caja] ([forma_pago_id]);
CREATE INDEX [IX_Caja_temporada_id] ON [Caja] ([temporada_id]);
CREATE INDEX [IX_ChequeMovimientos_cheque_id] ON [ChequeMovimientos] ([cheque_id]);
CREATE INDEX [IX_Cheques_proveedor_id] ON [Cheques] ([proveedor_id]);
CREATE INDEX [IX_Clasificacion_catClasif] ON [Clasificacion] ([categoria_clasif_id]);
CREATE INDEX [IX_Clasificacion_despalillado_id] ON [Clasificacion] ([despalillado_id]);
CREATE INDEX [IX_Clasificacion_empleado_id] ON [Clasificacion] ([empleado_id]);
CREATE INDEX [IX_Clasificacion_lote_id] ON [Clasificacion] ([lote_id]);
CREATE INDEX [IX_Clasificacion_sub_lote_id] ON [Clasificacion] ([sub_lote_id]);
CREATE INDEX [IX_Clasificacion_subCat] ON [Clasificacion] ([sub_categoria_id]);
CREATE INDEX [IX_Clasificacion_usuario_id] ON [Clasificacion] ([usuario_id]);
CREATE INDEX [IX_Compras_cheque_id] ON [Compras] ([cheque_id]);
CREATE INDEX [IX_Compras_forma_pago_id] ON [Compras] ([forma_pago_id]);
CREATE INDEX [IX_Compras_proveedor_id] ON [Compras] ([proveedor_id]);
CREATE INDEX [IX_Compras_temporada_id] ON [Compras] ([temporada_id]);
CREATE INDEX [IX_ComprasDetalle_compra_id] ON [ComprasDetalle] ([compra_id]);
CREATE INDEX [IX_ComprasDetalle_producto_id] ON [ComprasDetalle] ([producto_id]);
CREATE INDEX [IX_Configuracion_temporada_id] ON [Configuracion] ([temporada_id]);
CREATE INDEX [IX_CC_movimiento_deposito_id] ON [CuentaCorrienteClientes] ([movimiento_deposito_id]);
CREATE INDEX [IX_CC_nota_credito_id] ON [CuentaCorrienteClientes] ([nota_credito_id]);
CREATE INDEX [IX_CCClientes_cheque_id] ON [CuentaCorrienteClientes] ([cheque_id]);
CREATE INDEX [IX_CCClientes_cliente_id] ON [CuentaCorrienteClientes] ([cliente_id]);
CREATE INDEX [IX_CCClientes_forma_pago_id] ON [CuentaCorrienteClientes] ([forma_pago_id]);
CREATE INDEX [IX_CCClientes_temporada_id] ON [CuentaCorrienteClientes] ([temporada_id]);
CREATE INDEX [IX_CCProveedores_cheque_id] ON [CuentaCorrienteProveedores] ([cheque_id]);
CREATE INDEX [IX_CCProveedores_compra_id] ON [CuentaCorrienteProveedores] ([compra_id]);
CREATE INDEX [IX_CCProveedores_forma_pago_id] ON [CuentaCorrienteProveedores] ([forma_pago_id]);
CREATE INDEX [IX_CCProveedores_proveedor_id] ON [CuentaCorrienteProveedores] ([proveedor_id]);
CREATE INDEX [IX_CCProveedores_temporada_id] ON [CuentaCorrienteProveedores] ([temporada_id]);
CREATE INDEX [IX_Despalillado_deposito_id] ON [Despalillado] ([deposito_id]);
CREATE INDEX [IX_Despalillado_despalillador_id] ON [Despalillado] ([despalillador_id]);
CREATE INDEX [IX_Despalillado_juntada_id] ON [Despalillado] ([juntada_id]);
CREATE INDEX [IX_Despalillado_lote_id] ON [Despalillado] ([lote_id]);
CREATE INDEX [IX_Despalillado_parcela_id] ON [Despalillado] ([parcela_id]);
CREATE INDEX [IX_Despalillado_usuario_id] ON [Despalillado] ([usuario_id]);
CREATE INDEX [IX_EdicionesHistorial_usuario_id] ON [EdicionesHistorial] ([usuario_id]);
CREATE INDEX [IX_Embalaje_clasificacion_id] ON [Embalaje] ([clasificacion_id]);
CREATE INDEX [IX_Embalaje_deposito_id] ON [Embalaje] ([deposito_id]);
CREATE INDEX [IX_Embalaje_empleado_id] ON [Embalaje] ([empleado_id]);
CREATE INDEX [IX_Embalaje_producto_id] ON [Embalaje] ([producto_id]);
CREATE INDEX [IX_Embalaje_sub_lote_id] ON [Embalaje] ([sub_lote_id]);
CREATE INDEX [IX_Embalaje_tipo_embalaje_id] ON [Embalaje] ([tipo_embalaje_id]);
CREATE INDEX [IX_Embalaje_usuario_id] ON [Embalaje] ([usuario_id]);
CREATE INDEX [IX_Gastos_categoria_id] ON [Gastos] ([categoria_id]);
CREATE INDEX [IX_Gastos_forma_pago_id] ON [Gastos] ([forma_pago_id]);
CREATE INDEX [IX_Gastos_parcela_id] ON [Gastos] ([parcela_id]);
CREATE INDEX [IX_Gastos_proveedor_id] ON [Gastos] ([proveedor_id]);
CREATE INDEX [IX_Gastos_temporada_id] ON [Gastos] ([temporada_id]);
CREATE INDEX [IX_Juntada_deposito_id] ON [Juntada] ([deposito_id]);
CREATE INDEX [IX_Juntada_juntador_id] ON [Juntada] ([juntador_id]);
CREATE INDEX [IX_Juntada_lote_id_real] ON [Juntada] ([lote_id]);
CREATE INDEX [IX_Juntada_parcela_id] ON [Juntada] ([parcela_id]);
CREATE INDEX [IX_Juntada_usuario_id] ON [Juntada] ([usuario_id]);
CREATE INDEX [IX_JuntadaDestino_deposito_id] ON [JuntadaDestino] ([deposito_id]);
CREATE INDEX [IX_JuntadaDestino_juntada_id] ON [JuntadaDestino] ([juntada_id]);
CREATE INDEX [IX_Juntadores_personal_id] ON [Juntadores] ([personal_id]);
CREATE UNIQUE INDEX [UQ__Juntador__E0CC16DFAE7B3257] ON [Juntadores] ([qr_codigo]);
CREATE INDEX [IX_LoteClasif_lote] ON [LoteClasificadores] ([lote_id]);
CREATE INDEX [IX_LoteClasificadores_empleado_id] ON [LoteClasificadores] ([empleado_id]);
CREATE UNIQUE INDEX [UQ_LoteClas_Lote_Emp_Fecha] ON [LoteClasificadores] ([lote_id], [empleado_id], [fecha]);
CREATE INDEX [IX_LoteCosecheros_juntador_id] ON [LoteCosecheros] ([juntador_id]);
CREATE UNIQUE INDEX [UQ__LoteCose__1DD1F40C8B781D72] ON [LoteCosecheros] ([lote_id], [juntador_id]);
CREATE INDEX [IX_LoteDespalilladores_despalillador_id] ON [LoteDespalilladores] ([despalillador_id]);
CREATE UNIQUE INDEX [UQ__LoteDesp__41F71F2F35992239] ON [LoteDespalilladores] ([lote_id], [despalillador_id]);
CREATE INDEX [IX_LotesMerc_catClasif] ON [LotesMercaderia] ([categoria_clasif_id]);
CREATE INDEX [IX_LotesMerc_deposito_actual] ON [LotesMercaderia] ([deposito_actual_id]);
CREATE INDEX [IX_LotesMerc_subCat] ON [LotesMercaderia] ([sub_categoria_id]);
CREATE INDEX [IX_LotesMercaderia_categoria_id] ON [LotesMercaderia] ([categoria_id]);
CREATE INDEX [IX_LotesMercaderia_deposito_camara_id] ON [LotesMercaderia] ([deposito_camara_id]);
CREATE INDEX [IX_LotesMercaderia_deposito_id] ON [LotesMercaderia] ([deposito_id]);
CREATE INDEX [IX_LotesMercaderia_lote_padre_id] ON [LotesMercaderia] ([lote_padre_id]);
CREATE INDEX [IX_LotesMercaderia_parcela_id] ON [LotesMercaderia] ([parcela_id]);
CREATE INDEX [IX_LotesMercaderia_temporada_id] ON [LotesMercaderia] ([temporada_id]);
CREATE INDEX [IX_LotesMercaderia_usuario_id] ON [LotesMercaderia] ([usuario_id]);
CREATE INDEX [IX_MovDep_cliente_id] ON [MovimientosDeposito] ([cliente_id]);
CREATE INDEX [IX_MovDep_forma_pago_id] ON [MovimientosDeposito] ([forma_pago_id]);
CREATE INDEX [IX_MovDep_remito_id] ON [MovimientosDeposito] ([remito_id]);
CREATE INDEX [IX_MovimientosDeposito_deposito_id] ON [MovimientosDeposito] ([deposito_id]);
CREATE INDEX [IX_MovimientosDeposito_lote_id_real] ON [MovimientosDeposito] ([lote_id]);
CREATE INDEX [IX_MovimientosDeposito_parcela_id] ON [MovimientosDeposito] ([parcela_id]);
CREATE INDEX [IX_MovimientosDeposito_sub_lote_id] ON [MovimientosDeposito] ([sub_lote_id]);
CREATE INDEX [IX_MovimientosDeposito_temporada_id] ON [MovimientosDeposito] ([temporada_id]);
CREATE INDEX [IX_MovimientosDeposito_tipo_embalaje_id] ON [MovimientosDeposito] ([tipo_embalaje_id]);
CREATE INDEX [IX_NCI_nota_credito_id] ON [NotaCreditoItems] ([nota_credito_id]);
CREATE INDEX [IX_NCI_sub_lote_id] ON [NotaCreditoItems] ([sub_lote_id]);
CREATE INDEX [IX_NC_cliente_id] ON [NotasCredito] ([cliente_id]);
CREATE INDEX [IX_NC_estado] ON [NotasCredito] ([estado]);
CREATE INDEX [IX_NC_remito_id] ON [NotasCredito] ([remito_id]);
CREATE UNIQUE INDEX [UQ__NotasCre__FC77F211D64B143B] ON [NotasCredito] ([numero]);
CREATE INDEX [IX_Pagos_cheque_id] ON [Pagos] ([cheque_id]);
CREATE INDEX [IX_Pagos_forma_pago_id] ON [Pagos] ([forma_pago_id]);
CREATE INDEX [IX_Pagos_juntador_id] ON [Pagos] ([juntador_id]);
CREATE INDEX [IX_Parcelas_temporada_id] ON [Parcelas] ([temporada_id]);
CREATE INDEX [IX_Parcelas_variedad_id] ON [Parcelas] ([variedad_id]);
CREATE UNIQUE INDEX [UQ_PermisosRol] ON [PermisosRol] ([rol], [permiso]);
CREATE UNIQUE INDEX [UQ_PersonalRoles] ON [PersonalRoles] ([personal_id], [rol]);
CREATE INDEX [IX_PrecioHistorico_temporada_id] ON [PrecioHistorico] ([temporada_id]);
CREATE INDEX [IX_PreciosRol_temporada] ON [PreciosRol] ([temporada_id]);
CREATE INDEX [IX_Productos_proveedor_id] ON [Productos] ([proveedor_id]);
CREATE INDEX [IX_RemitoItems_movimiento_id] ON [RemitoItems] ([movimiento_id]);
CREATE INDEX [IX_RemitoItems_remito_id] ON [RemitoItems] ([remito_id]);
CREATE INDEX [IX_RemitoItems_sub_lote_id] ON [RemitoItems] ([sub_lote_id]);
CREATE INDEX [IX_Remitos_cliente_id] ON [Remitos] ([cliente_id]);
CREATE INDEX [IX_Remitos_forma_pago_id] ON [Remitos] ([forma_pago_id]);
CREATE INDEX [IX_Remitos_temporada_id] ON [Remitos] ([temporada_id]);
CREATE INDEX [IX_StockInsumos_deposito_id] ON [StockInsumos] ([deposito_id]);
CREATE INDEX [IX_StockInsumos_lote_id] ON [StockInsumos] ([parcela_id]);
CREATE INDEX [IX_StockInsumos_producto_id] ON [StockInsumos] ([producto_id]);
CREATE INDEX [IX_SubCat_padre] ON [SubCategoriasClasificacion] ([categoria_padre_id]);
CREATE UNIQUE INDEX [UQ__SubCateg__C0D77318F8B5BABB] ON [SubCategoriasClasificacion] ([categoria_padre_id], [nombre]);
CREATE INDEX [IX_TareaInsumos_producto] ON [TareaInsumos] ([producto_id]);
CREATE INDEX [IX_TareaInsumos_tarea] ON [TareaInsumos] ([tarea_id]);
CREATE INDEX [IX_TareasGenerales_categoria] ON [TareasGenerales] ([categoria_tarea_id]);
CREATE INDEX [IX_TareasGenerales_parcela] ON [TareasGenerales] ([parcela_id]);
CREATE INDEX [IX_TareasGenerales_temporada] ON [TareasGenerales] ([temporada_id]);
CREATE INDEX [IX_TareasGenerales_usuario_id] ON [TareasGenerales] ([usuario_id]);
CREATE INDEX [IX_TareaTrabajadores_tarea] ON [TareaTrabajadores] ([tarea_id]);
CREATE INDEX [IX_TareaTrabajadores_trabajador] ON [TareaTrabajadores] ([trabajador_id]);
CREATE UNIQUE INDEX [UX_Temporadas_activa] ON [Temporadas] ([activa]) WHERE ([activa]=(1));
CREATE INDEX [IX_TiposEmbalaje_activo] ON [TiposEmbalaje] ([activo]);
CREATE UNIQUE INDEX [UQ__Usuarios__9AFF8FC6CA5B4AEA] ON [Usuarios] ([usuario]);
CREATE INDEX [IX_VentaEmbalaje_movimiento_id] ON [VentaEmbalaje] ([movimiento_id]);
CREATE INDEX [IX_VentaEmbalaje_producto_id] ON [VentaEmbalaje] ([producto_id]);

-- ══ VIEWS ══
GO

CREATE VIEW VistaCariencia AS
SELECT
  a.id,
  l.nombre AS parcela,
  p.nombre AS producto,
  a.fecha_hora,
  a.carencia_dias,
  DATEADD(day, a.carencia_dias, a.fecha_hora) AS fecha_libre,
  CASE
    WHEN DATEADD(day, a.carencia_dias, a.fecha_hora) > GETDATE()
    THEN 'EN CARENCIA'
    ELSE 'LIBRE'
  END AS estado
FROM Aplicaciones a
JOIN Parcelas l ON a.parcela_id = l.id
JOIN Productos p ON a.producto_id = p.id
WHERE a.carencia_dias IS NOT NULL AND a.carencia_dias > 0;
GO

-- ══ FIN ══