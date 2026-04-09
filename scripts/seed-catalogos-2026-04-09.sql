-- ══════════════════════════════════════════════════════════════════
-- CosechaApp — Seed de catalogos maestros
-- Fecha: 2026-04-09
-- Uso: ejecutar DESPUES de schema-full-2026-04-09.sql en DB limpia
-- Idempotente: usa INSERT solo si la tabla esta vacia
-- ══════════════════════════════════════════════════════════════════

-- ══ variedades_frutilla (38 filas) ══
IF NOT EXISTS (SELECT 1 FROM [variedades_frutilla])
BEGIN
  SET IDENTITY_INSERT [variedades_frutilla] ON;
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (1, N'Albion', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (2, N'Aromas', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (3, N'Benicia', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (4, N'Brilliance', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (5, N'Calinda', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (6, N'Camarosa', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (7, N'Camino Real', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (8, N'Chandler', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (9, N'Diamante', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (10, N'Douglas', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (11, N'Evie 2', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (12, N'Festival', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (13, N'Festival Florida', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (14, N'Florentina', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (15, N'Fortuna', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (16, N'Fronteras', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (17, N'Kabarla', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (18, N'Medallion', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (19, N'Monterey', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (20, N'Oso Grande', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (21, N'Pajaro', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (22, N'Palomar', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (23, N'Parker', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (24, N'Portola', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (25, N'Radiance', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (26, N'Redlands Hope', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (27, N'Rubygem', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (28, N'Sabrina', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (29, N'San Andreas', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (30, N'Seascape', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (31, N'Selva', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (32, N'Splendor', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (33, N'Sweet Charlie', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (34, N'Sweet Sensation', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (35, N'Tioga', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (36, N'Tufts', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (37, N'Ventana', 1);
  INSERT INTO [variedades_frutilla] ([id], [nombre], [activa]) VALUES (38, N'Winter Dawn', 1);
  SET IDENTITY_INSERT [variedades_frutilla] OFF;
END
GO

-- ══ TiposEmbalaje (7 filas) ══
IF NOT EXISTS (SELECT 1 FROM [TiposEmbalaje])
BEGIN
  SET IDENTITY_INSERT [TiposEmbalaje] ON;
  INSERT INTO [TiposEmbalaje] ([id], [nombre], [peso_kg], [activo], [created_at]) VALUES (1, N'Cajón plástico 15kg', 15, 1, '2026-04-07T05:51:02.430Z');
  INSERT INTO [TiposEmbalaje] ([id], [nombre], [peso_kg], [activo], [created_at]) VALUES (2, N'Caja cartón 5kg', 5, 1, '2026-04-07T05:51:02.430Z');
  INSERT INTO [TiposEmbalaje] ([id], [nombre], [peso_kg], [activo], [created_at]) VALUES (3, N'Bandeja plástica 500g', 0.5, 1, '2026-04-07T05:51:02.430Z');
  INSERT INTO [TiposEmbalaje] ([id], [nombre], [peso_kg], [activo], [created_at]) VALUES (4, N'Bandeja plástica 250g', 0.25, 1, '2026-04-07T05:51:02.430Z');
  INSERT INTO [TiposEmbalaje] ([id], [nombre], [peso_kg], [activo], [created_at]) VALUES (5, N'Cajón madera 20kg', 20, 1, '2026-04-07T05:51:02.430Z');
  INSERT INTO [TiposEmbalaje] ([id], [nombre], [peso_kg], [activo], [created_at]) VALUES (6, N'Caja cartón 2.5kg', 2.5, 1, '2026-04-07T05:51:45.747Z');
  INSERT INTO [TiposEmbalaje] ([id], [nombre], [peso_kg], [activo], [created_at]) VALUES (7, N'Balde plástico 10kg', 10, 1, '2026-04-07T05:51:45.747Z');
  SET IDENTITY_INSERT [TiposEmbalaje] OFF;
END
GO

-- ══ CategoriasFruta (6 filas) ══
IF NOT EXISTS (SELECT 1 FROM [CategoriasFruta])
BEGIN
  SET IDENTITY_INSERT [CategoriasFruta] ON;
  INSERT INTO [CategoriasFruta] ([id], [nombre], [tamano], [madurez], [activo]) VALUES (1, N'Grande Madura', N'grande', N'madura', 1);
  INSERT INTO [CategoriasFruta] ([id], [nombre], [tamano], [madurez], [activo]) VALUES (2, N'Grande Pintona', N'grande', N'pintona', 1);
  INSERT INTO [CategoriasFruta] ([id], [nombre], [tamano], [madurez], [activo]) VALUES (3, N'Media Madura', N'media', N'madura', 1);
  INSERT INTO [CategoriasFruta] ([id], [nombre], [tamano], [madurez], [activo]) VALUES (4, N'Media Pintona', N'media', N'pintona', 1);
  INSERT INTO [CategoriasFruta] ([id], [nombre], [tamano], [madurez], [activo]) VALUES (5, N'Chica Madura', N'chica', N'madura', 1);
  INSERT INTO [CategoriasFruta] ([id], [nombre], [tamano], [madurez], [activo]) VALUES (6, N'Chica Pintona', N'chica', N'pintona', 1);
  SET IDENTITY_INSERT [CategoriasFruta] OFF;
END
GO

-- ══ CategoriasGasto (12 filas) ══
IF NOT EXISTS (SELECT 1 FROM [CategoriasGasto])
BEGIN
  SET IDENTITY_INSERT [CategoriasGasto] ON;
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (1, N'Implantacion', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (2, N'Semillas y plantines', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (3, N'Preparacion del suelo', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (4, N'Riego', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (5, N'Mano de obra general', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (6, N'Asesoramiento tecnico', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (7, N'Flete y transporte', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (8, N'Energia y combustible', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (9, N'Alquiler de tierra', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (10, N'Mantenimiento de equipos', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (11, N'Impuestos y tasas', NULL, 1);
  INSERT INTO [CategoriasGasto] ([id], [nombre], [descripcion], [activo]) VALUES (12, N'Otros', NULL, 1);
  SET IDENTITY_INSERT [CategoriasGasto] OFF;
END
GO

-- ══ CategoriasTarea (35 filas) ══
IF NOT EXISTS (SELECT 1 FROM [CategoriasTarea])
BEGIN
  SET IDENTITY_INSERT [CategoriasTarea] ON;
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (1, N'Arado / rastreado', N'Preparación de suelo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (2, N'Armado de camellones', N'Preparación de suelo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (3, N'Colocación de mulching plástico', N'Preparación de suelo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (4, N'Desinfección de suelo', N'Preparación de suelo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (5, N'Enmiendas y materia orgánica', N'Preparación de suelo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (6, N'Análisis de suelo', N'Preparación de suelo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (7, N'Marcado y perforado de mulching', N'Plantación', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (8, N'Trasplante de plantines', N'Plantación', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (9, N'Reposición de fallas (replante)', N'Plantación', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (10, N'Instalación de cintas de riego', N'Riego', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (11, N'Reparación de cintas / goteros', N'Riego', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (12, N'Mantenimiento de bomba / cabezal', N'Riego', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (13, N'Limpieza de filtros', N'Riego', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (14, N'Fertirriego', N'Riego', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (15, N'Armado de microtúneles', N'Estructuras', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (16, N'Armado de macrotúneles', N'Estructuras', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (17, N'Colocación de plástico en túneles', N'Estructuras', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (18, N'Reparación de plástico roto', N'Estructuras', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (19, N'Retiro de cobertura (ventilación)', N'Estructuras', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (20, N'Armado/mantenimiento de invernadero', N'Estructuras', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (21, N'Desmalezado manual', N'Mantenimiento cultivo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (22, N'Poda de estolones (guías)', N'Mantenimiento cultivo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (23, N'Limpieza de hojas secas/enfermas', N'Mantenimiento cultivo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (24, N'Aporque', N'Mantenimiento cultivo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (25, N'Raleo de flores', N'Mantenimiento cultivo', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (26, N'Mantenimiento de cámara fría', N'Cámara / Galpón', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (27, N'Limpieza y desinfección de galpón', N'Cámara / Galpón', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (28, N'Limpieza de línea de clasificación', N'Cámara / Galpón', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (29, N'Mantenimiento de equipos', N'Cámara / Galpón', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (30, N'Limpieza de caminos internos', N'Logística / Varios', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (31, N'Reparación de cercos', N'Logística / Varios', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (32, N'Carga/descarga de insumos', N'Logística / Varios', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (33, N'Traslado de cajones/bins', N'Logística / Varios', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (34, N'Limpieza general de quinta', N'Logística / Varios', 1);
  INSERT INTO [CategoriasTarea] ([id], [nombre], [categoria], [activo]) VALUES (35, N'Otros', N'Otros', 1);
  SET IDENTITY_INSERT [CategoriasTarea] OFF;
END
GO

-- ══ CategoriasClasificacion (4 filas) ══
IF NOT EXISTS (SELECT 1 FROM [CategoriasClasificacion])
BEGIN
  SET IDENTITY_INSERT [CategoriasClasificacion] ON;
  INSERT INTO [CategoriasClasificacion] ([id], [nombre], [codigo], [orden], [es_descarte], [activo], [es_fija]) VALUES (1, N'Chica', N'CH', 1, 0, 1, 1);
  INSERT INTO [CategoriasClasificacion] ([id], [nombre], [codigo], [orden], [es_descarte], [activo], [es_fija]) VALUES (2, N'Mediana', N'ME', 2, 0, 1, 1);
  INSERT INTO [CategoriasClasificacion] ([id], [nombre], [codigo], [orden], [es_descarte], [activo], [es_fija]) VALUES (3, N'Grande', N'GR', 3, 0, 1, 1);
  INSERT INTO [CategoriasClasificacion] ([id], [nombre], [codigo], [orden], [es_descarte], [activo], [es_fija]) VALUES (4, N'Descarte', N'DE', 4, 1, 1, 1);
  SET IDENTITY_INSERT [CategoriasClasificacion] OFF;
END
GO

-- ══ SubCategoriasClasificacion (11 filas) ══
IF NOT EXISTS (SELECT 1 FROM [SubCategoriasClasificacion])
BEGIN
  SET IDENTITY_INSERT [SubCategoriasClasificacion] ON;
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (1, 3, N'Madura', N'MAD', 1, '2026-04-03T15:28:40.170Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (2, 3, N'Pintona', N'PIN', 1, '2026-04-03T15:28:40.193Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (3, 2, N'Pintona', N'PIN', 1, '2026-04-03T15:28:40.227Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (4, 2, N'Roja Firme', N'ROJ', 1, '2026-04-03T16:03:45.360Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (5, 1, N'pero matona', N'PER', 1, '2026-04-03T16:06:26.943Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (6, 1, N'TIPO B', N'TIP', 1, '2026-04-07T06:03:56.123Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (7, 2, N'TIPO A', N'TIP', 1, '2026-04-07T06:05:26.240Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (8, 1, N'madura', N'MAD', 1, '2026-04-07T20:12:51.550Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (9, 3, N'tipo a', N'TIP', 1, '2026-04-07T20:13:11.990Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (10, 2, N'firme', N'FIR', 1, '2026-04-09T06:41:39.993Z');
  INSERT INTO [SubCategoriasClasificacion] ([id], [categoria_padre_id], [nombre], [codigo], [activo], [fecha_creacion]) VALUES (11, 3, N'premium', N'PRE', 1, '2026-04-09T06:41:40.023Z');
  SET IDENTITY_INSERT [SubCategoriasClasificacion] OFF;
END
GO

-- ══ FormasPago (7 filas) ══
IF NOT EXISTS (SELECT 1 FROM [FormasPago])
BEGIN
  SET IDENTITY_INSERT [FormasPago] ON;
  INSERT INTO [FormasPago] ([id], [nombre], [activo], [es_cuenta_corriente]) VALUES (1, N'Efectivo', 1, 0);
  INSERT INTO [FormasPago] ([id], [nombre], [activo], [es_cuenta_corriente]) VALUES (2, N'Transferencia', 1, 0);
  INSERT INTO [FormasPago] ([id], [nombre], [activo], [es_cuenta_corriente]) VALUES (3, N'Cheque propio', 1, 0);
  INSERT INTO [FormasPago] ([id], [nombre], [activo], [es_cuenta_corriente]) VALUES (4, N'Cheque tercero', 1, 0);
  INSERT INTO [FormasPago] ([id], [nombre], [activo], [es_cuenta_corriente]) VALUES (5, N'Tarjeta debito', 1, 0);
  INSERT INTO [FormasPago] ([id], [nombre], [activo], [es_cuenta_corriente]) VALUES (6, N'Tarjeta credito', 1, 0);
  INSERT INTO [FormasPago] ([id], [nombre], [activo], [es_cuenta_corriente]) VALUES (7, N'Cuenta Corriente', 1, 1);
  SET IDENTITY_INSERT [FormasPago] OFF;
END
GO

-- ══ PermisosRol (92 filas) ══
IF NOT EXISTS (SELECT 1 FROM [PermisosRol])
BEGIN
  SET IDENTITY_INSERT [PermisosRol] ON;
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (93, N'administrador', N'cosecha', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (94, N'administrador', N'despalillado', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (95, N'administrador', N'aplicaciones', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (96, N'administrador', N'stock_mercaderia', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (97, N'administrador', N'stock_insumos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (98, N'administrador', N'compras', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (99, N'administrador', N'ventas', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (100, N'administrador', N'proveedores', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (101, N'administrador', N'clientes', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (102, N'administrador', N'caja', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (103, N'administrador', N'balance', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (104, N'administrador', N'gastos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (105, N'administrador', N'cheques', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (106, N'administrador', N'pagos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (107, N'administrador', N'lotes', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (108, N'administrador', N'personal', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (109, N'administrador', N'depositos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (110, N'administrador', N'productos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (111, N'administrador', N'temporadas', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (112, N'administrador', N'reportes', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (113, N'administrador', N'mercado', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (114, N'administrador', N'usuarios', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (115, N'administrador', N'editar_movimientos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (116, N'ingeniero', N'cosecha', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (117, N'ingeniero', N'despalillado', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (118, N'ingeniero', N'aplicaciones', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (119, N'ingeniero', N'stock_mercaderia', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (120, N'ingeniero', N'stock_insumos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (121, N'ingeniero', N'compras', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (122, N'ingeniero', N'ventas', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (123, N'ingeniero', N'proveedores', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (124, N'ingeniero', N'clientes', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (125, N'ingeniero', N'caja', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (126, N'ingeniero', N'balance', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (127, N'ingeniero', N'gastos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (128, N'ingeniero', N'cheques', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (129, N'ingeniero', N'pagos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (130, N'ingeniero', N'lotes', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (131, N'ingeniero', N'personal', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (132, N'ingeniero', N'depositos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (133, N'ingeniero', N'productos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (134, N'ingeniero', N'temporadas', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (135, N'ingeniero', N'reportes', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (136, N'ingeniero', N'mercado', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (137, N'ingeniero', N'usuarios', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (138, N'ingeniero', N'editar_movimientos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (139, N'encargado', N'cosecha', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (140, N'encargado', N'despalillado', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (141, N'encargado', N'aplicaciones', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (142, N'encargado', N'stock_mercaderia', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (143, N'encargado', N'stock_insumos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (144, N'encargado', N'compras', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (145, N'encargado', N'ventas', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (146, N'encargado', N'proveedores', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (147, N'encargado', N'clientes', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (148, N'encargado', N'caja', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (149, N'encargado', N'balance', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (150, N'encargado', N'gastos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (151, N'encargado', N'cheques', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (152, N'encargado', N'pagos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (153, N'encargado', N'lotes', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (154, N'encargado', N'personal', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (155, N'encargado', N'depositos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (156, N'encargado', N'productos', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (157, N'encargado', N'temporadas', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (158, N'encargado', N'reportes', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (159, N'encargado', N'mercado', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (160, N'encargado', N'usuarios', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (161, N'encargado', N'editar_movimientos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (162, N'usuario', N'cosecha', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (163, N'usuario', N'despalillado', 1);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (164, N'usuario', N'aplicaciones', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (165, N'usuario', N'stock_mercaderia', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (166, N'usuario', N'stock_insumos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (167, N'usuario', N'compras', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (168, N'usuario', N'ventas', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (169, N'usuario', N'proveedores', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (170, N'usuario', N'clientes', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (171, N'usuario', N'caja', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (172, N'usuario', N'balance', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (173, N'usuario', N'gastos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (174, N'usuario', N'cheques', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (175, N'usuario', N'pagos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (176, N'usuario', N'lotes', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (177, N'usuario', N'personal', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (178, N'usuario', N'depositos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (179, N'usuario', N'productos', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (180, N'usuario', N'temporadas', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (181, N'usuario', N'reportes', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (182, N'usuario', N'mercado', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (183, N'usuario', N'usuarios', 0);
  INSERT INTO [PermisosRol] ([id], [rol], [permiso], [habilitado]) VALUES (184, N'usuario', N'editar_movimientos', 0);
  SET IDENTITY_INSERT [PermisosRol] OFF;
END
GO

-- ══ PLACEHOLDERS INICIALES (reemplazar tras primer login) ══

-- Deposito inicial
IF NOT EXISTS (SELECT 1 FROM Depositos)
  INSERT INTO Depositos (nombre, tipo, tipo_deposito, activo) VALUES (N'Galpón Principal', N'galpon', N'fruta_fresca', 1);
GO

-- Configuracion de empresa (placeholder)
IF NOT EXISTS (SELECT 1 FROM ConfiguracionEmpresa)
  INSERT INTO ConfiguracionEmpresa (razon_social, cuit) VALUES (N'Mi Empresa', N'00-00000000-0');
GO

-- Temporada activa inicial
IF NOT EXISTS (SELECT 1 FROM Temporadas WHERE activa = 1)
  INSERT INTO Temporadas (nombre, tipo, cultivo, fecha_inicio, activa) VALUES (N'Campaña Actual', N'plena', N'frutilla', GETDATE(), 1);
GO

-- PreciosRol para la temporada inicial (precios placeholder)
IF NOT EXISTS (SELECT 1 FROM PreciosRol)
BEGIN
  DECLARE @tid INT = (SELECT TOP 1 id FROM Temporadas WHERE activa = 1);
  INSERT INTO PreciosRol (temporada_id, actividad, unidad, precio, activo) VALUES
    (@tid, 'juntada',       'kilo', 150, 1),
    (@tid, 'despalillado',  'kilo', 80, 1),
    (@tid, 'clasificacion', 'hora', 2500, 1),
    (@tid, 'embalaje',      'hora', 2500, 1),
    (@tid, 'aplicacion',    'hora', 3000, 1),
    (@tid, 'trabajo_campo', 'hora', 2000, 1);
END
GO

-- ══ FIN SEED ══