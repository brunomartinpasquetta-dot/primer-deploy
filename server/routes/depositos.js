const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');
const { siguienteNumero: siguienteNumeroRemito } = require('./remitos');

// ── Resumen general por temporada (antes que /:id para evitar conflicto de ruta)
router.get('/resumen', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where = 'temporada_id = @temporada_id';
    }
    const result = await dbReq.query(`
      SELECT
        ISNULL(SUM(CASE WHEN tipo = 'ingreso'         THEN kilos ELSE 0 END), 0) AS kilos_ingresados,
        ISNULL(SUM(CASE WHEN tipo = 'egreso_venta'    THEN kilos ELSE 0 END), 0) AS kilos_vendidos,
        ISNULL(SUM(CASE WHEN tipo = 'egreso_descarte' THEN kilos ELSE 0 END), 0) AS kilos_descartados,
        ISNULL(SUM(CASE WHEN tipo = 'ingreso'         THEN kilos ELSE 0 END), 0) -
        ISNULL(SUM(CASE WHEN tipo = 'egreso_venta'    THEN kilos ELSE 0 END), 0) -
        ISNULL(SUM(CASE WHEN tipo = 'egreso_descarte' THEN kilos ELSE 0 END), 0) AS kilos_en_deposito,
        ISNULL(SUM(CASE WHEN tipo = 'egreso_venta' THEN kilos * ISNULL(precio_kilo, 0) ELSE 0 END), 0) AS ingresos_venta
      FROM MovimientosDeposito
      WHERE ${where}`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Lista todos los depósitos con stock actual ──────────────────
router.get('/', async (req, res) => {
  try {
    const { tipo_stock } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'd.activo = 1';
    if (tipo_stock === 'insumos') {
      where += ` AND d.tipo_deposito = 'insumos'`;
    } else if (tipo_stock === 'mercaderia') {
      where += ` AND d.tipo_deposito IN ('fruta_fresca','camara_frio')`;
    }
    const result = await dbReq.query(`
      SELECT d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg, d.costo_kg_dia,
             d.ubicacion, d.observacion, d.activo,
             ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'         THEN m.kilos ELSE 0 END), 0) -
             ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%'      THEN m.kilos ELSE 0 END), 0) AS stock_actual,
             ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'         THEN m.kilos ELSE 0 END), 0) AS total_ingresado,
             ISNULL(SUM(CASE WHEN m.tipo = 'egreso_venta'    THEN m.kilos ELSE 0 END), 0) AS total_vendido,
             ISNULL(SUM(CASE WHEN m.tipo = 'egreso_descarte' THEN m.kilos ELSE 0 END), 0) AS total_descartado
      FROM Depositos d
      LEFT JOIN MovimientosDeposito m ON d.id = m.deposito_id
      WHERE ${where}
      GROUP BY d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg, d.costo_kg_dia,
               d.ubicacion, d.observacion, d.activo
      ORDER BY d.nombre`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Crear depósito ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { nombre, tipo, tipo_deposito, capacidad_kg, costo_kg_dia, ubicacion, observacion } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
    const tiposDepValidos = ['fruta_fresca', 'camara_frio', 'insumos'];
    const tipoDepVal = tiposDepValidos.includes(tipo_deposito) ? tipo_deposito : 'fruta_fresca';
    const pool = await getPool();
    const result = await pool.request()
      .input('nombre',         sql.NVarChar,       nombre)
      .input('tipo',           sql.NVarChar,       tipo)
      .input('tipo_deposito',  sql.NVarChar,       tipoDepVal)
      .input('capacidad_kg',   sql.Decimal(12, 2), capacidad_kg || null)
      .input('costo_kg_dia',   sql.Decimal(10, 4), costo_kg_dia || null)
      .input('ubicacion',      sql.NVarChar,       ubicacion    || '')
      .input('observacion',    sql.NVarChar,       observacion  || '')
      .query(`INSERT INTO Depositos (nombre, tipo, tipo_deposito, capacidad_kg, costo_kg_dia, ubicacion, observacion)
              OUTPUT INSERTED.id
              VALUES (@nombre, @tipo, @tipo_deposito, @capacidad_kg, @costo_kg_dia, @ubicacion, @observacion)`);
    res.json({ ok: true, id: result.recordset[0].id });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Editar depósito ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { nombre, tipo, tipo_deposito, capacidad_kg, costo_kg_dia, ubicacion, observacion, activo } = req.body;
    const tiposDepValidos = ['fruta_fresca', 'camara_frio', 'insumos'];
    const tipoDepVal = tiposDepValidos.includes(tipo_deposito) ? tipo_deposito : 'fruta_fresca';
    const pool = await getPool();
    await pool.request()
      .input('id',            sql.Int,            req.params.id)
      .input('nombre',        sql.NVarChar,       nombre)
      .input('tipo',          sql.NVarChar,       tipo)
      .input('tipo_deposito', sql.NVarChar,       tipoDepVal)
      .input('capacidad_kg',  sql.Decimal(12, 2), capacidad_kg || null)
      .input('costo_kg_dia',  sql.Decimal(10, 4), costo_kg_dia || null)
      .input('ubicacion',     sql.NVarChar,       ubicacion    || '')
      .input('observacion',   sql.NVarChar,       observacion  || '')
      .input('activo',        sql.Bit,            activo !== undefined ? (activo ? 1 : 0) : 1)
      .query(`UPDATE Depositos SET nombre=@nombre, tipo=@tipo, tipo_deposito=@tipo_deposito,
              capacidad_kg=@capacidad_kg, costo_kg_dia=@costo_kg_dia, ubicacion=@ubicacion,
              observacion=@observacion, activo=@activo WHERE id=@id`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Stock de un depósito ────────────────────────────────────────
router.get('/:id/stock', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN tipo = 'ingreso'         THEN kilos ELSE 0 END), 0) AS ingresado,
          ISNULL(SUM(CASE WHEN tipo = 'egreso_venta'    THEN kilos ELSE 0 END), 0) AS vendido,
          ISNULL(SUM(CASE WHEN tipo = 'egreso_descarte' THEN kilos ELSE 0 END), 0) AS descartado,
          ISNULL(SUM(CASE WHEN tipo = 'ingreso'         THEN kilos ELSE 0 END), 0) -
          ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%'      THEN kilos ELSE 0 END), 0) AS stock_actual
        FROM MovimientosDeposito WHERE deposito_id = @id`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Historial de movimientos de un depósito ─────────────────────
router.get('/:id/movimientos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT m.id, m.tipo, m.kilos, m.precio_kilo, m.comprador,
               m.destino_venta, m.fecha, m.observacion,
               l.nombre AS parcela, t.nombre AS temporada
        FROM MovimientosDeposito m
        LEFT JOIN Parcelas      l ON m.parcela_id      = l.id
        LEFT JOIN Temporadas t ON m.temporada_id = t.id
        WHERE m.deposito_id = @id
        ORDER BY m.fecha DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Registrar ingreso al depósito ───────────────────────────────
router.post('/ingreso', async (req, res) => {
  const { deposito_id, temporada_id, parcela_id, kilos, fecha, observacion } = req.body;
  if (!deposito_id || !temporada_id || !kilos) {
    return res.status(400).json({ error: 'Depósito, temporada y kilos son obligatorios' });
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const fechaDate = fecha ? new Date(fecha) : new Date();

    // 1. MovimientosDeposito
    await new sql.Request(transaction)
      .input('deposito_id',  sql.Int,           deposito_id)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('parcela_id',      sql.Int,           parcela_id || null)
      .input('kilos',        sql.Decimal(10,2), kilos)
      .input('fecha',        sql.DateTime,      fechaDate)
      .input('observacion',  sql.NVarChar,      observacion || '')
      .query(`INSERT INTO MovimientosDeposito
              (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion)
              VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso', @kilos, @fecha, @observacion)`);

    // 2. StockMercaderia — refleja ingreso de kg
    await new sql.Request(transaction)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('parcela_id',      sql.Int,           parcela_id || null)
      .input('kilos',        sql.Decimal(10,2), kilos)
      .input('observacion',  sql.NVarChar,      observacion || '')
      .query(`INSERT INTO StockMercaderia (temporada_id, parcela_id, tipo, kilos, destino, observacion)
              VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, 'deposito', @observacion)`);

    await transaction.commit();
    res.json({ ok: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Stock vendible agrupado por categoría + sub-categoría ────────
router.get('/stock-vendible-resumen', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "sl.etapa IN ('embalado', 'vendido_parcial', 'clasificado') AND sl.lote_padre_id IS NOT NULL";
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where += ' AND sl.temporada_id = @temporada_id';
    }
    const result = await dbReq.query(`
      ;WITH vendido AS (
        SELECT ri.sub_lote_id, SUM(ri.kilos) AS kg_vend
        FROM RemitoItems ri
        GROUP BY ri.sub_lote_id
      )
      SELECT
        cc.id   AS categoria_id,
        cc.nombre AS categoria,
        sc.id   AS sub_categoria_id,
        sc.nombre AS sub_categoria,
        COUNT(*)  AS cantidad_lotes,
        SUM(sl.kilos) AS kilos_total,
        ISNULL(SUM(v.kg_vend), 0) AS kilos_vendidos
      FROM LotesMercaderia sl
      LEFT JOIN CategoriasClasificacion cc    ON sl.categoria_clasif_id = cc.id
      LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id    = sc.id
      LEFT JOIN vendido v                     ON v.sub_lote_id          = sl.id
      WHERE ${where}
      GROUP BY cc.id, cc.nombre, sc.id, sc.nombre
      HAVING SUM(sl.kilos) - ISNULL(SUM(v.kg_vend), 0) > 0
      ORDER BY cc.nombre, sc.nombre`);

    const resumen = result.recordset.map(r => ({
      ...r,
      kg_disponibles: parseFloat((r.kilos_total - r.kilos_vendidos).toFixed(3))
    }));
    res.json(resumen);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Kg en proceso (etapas intermedias, no vendible aún) ──────────
router.get('/kg-en-proceso', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "etapa IN ('cosecha', 'despalillado', 'en_clasificacion', 'clasificado') AND estado != 'anulada'";
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where += ' AND temporada_id = @temporada_id';
    }
    const result = await dbReq.query(`
      SELECT ISNULL(SUM(kilos), 0) AS kg_en_proceso
      FROM LotesMercaderia
      WHERE ${where}`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Stock vendible: sub-lotes embalados con kg disponibles ──────────
router.get('/stock-vendible', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = "sl.etapa IN ('embalado', 'vendido_parcial', 'clasificado') AND sl.lote_padre_id IS NOT NULL";
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where += ' AND sl.temporada_id = @temporada_id';
    }
    const result = await dbReq.query(`
      SELECT sl.id,
             sl.codigo_interno,
             sl.codigo_externo,
             sl.kilos,
             sl.deposito_actual_id,
             d.nombre              AS deposito_nombre,
             cc.nombre             AS categoria,
             sc.nombre             AS sub_categoria,
             p.nombre              AS parcela,
             ISNULL(p.variedad, '') AS variedad,
             lp.codigo_interno     AS lote_padre_codigo,
             sl.fecha_envasado,
             ISNULL((SELECT SUM(ri.kilos) FROM RemitoItems ri WHERE ri.sub_lote_id = sl.id), 0) AS kilos_vendidos
      FROM LotesMercaderia sl
      LEFT JOIN LotesMercaderia lp           ON sl.lote_padre_id        = lp.id
      LEFT JOIN CategoriasClasificacion cc    ON sl.categoria_clasif_id  = cc.id
      LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id     = sc.id
      LEFT JOIN Parcelas p                   ON sl.parcela_id           = p.id
      LEFT JOIN Depositos d                  ON sl.deposito_actual_id   = d.id
      WHERE ${where}
      ORDER BY d.nombre, cc.nombre, sc.nombre`);

    // Calcular kg disponibles y filtrar los que tienen stock
    const vendibles = result.recordset
      .map(sl => ({
        ...sl,
        kg_disponibles: parseFloat((sl.kilos - sl.kilos_vendidos).toFixed(3))
      }))
      .filter(sl => sl.kg_disponibles > 0);

    res.json(vendibles);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Stock disponible por depósito, desglosado por variedad + parcela ──
router.get('/stock-disponible', async (req, res) => {
  try {
    const { deposito_id, temporada_id } = req.query;
    if (!deposito_id) return res.status(400).json({ error: 'deposito_id requerido' });
    const pool = await getPool();
    const dbReq = pool.request().input('did', sql.Int, parseInt(deposito_id));
    let where = 'm.deposito_id = @did';
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where += ' AND m.temporada_id = @temporada_id';
    }
    const result = await dbReq.query(`
      SELECT
        l.id   AS parcela_id,
        l.nombre AS parcela,
        ISNULL(l.variedad, 'Sin variedad') AS variedad,
        ISNULL(SUM(CASE WHEN m.tipo='ingreso'      THEN m.kilos ELSE 0 END),0) -
        ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' THEN m.kilos ELSE 0 END),0) AS kg_disponibles
      FROM MovimientosDeposito m
      JOIN Parcelas l ON m.parcela_id = l.id
      WHERE ${where}
      GROUP BY l.id, l.nombre, l.variedad
      HAVING
        ISNULL(SUM(CASE WHEN m.tipo='ingreso'      THEN m.kilos ELSE 0 END),0) -
        ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' THEN m.kilos ELSE 0 END),0) > 0
      ORDER BY variedad, parcela`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Registrar venta (uno o varios items de mercadería) ──────────
// Body: {
//   cliente_id, temporada_id, forma_pago_id, fecha, destino_venta, observacion,
//   numero_remito,   // opcional — se genera automáticamente si no se pasa
//   items: [{ sub_lote_id, kilos, precio_kilo }],
//   embalaje: [{ producto_id, cantidad, costo_unitario, retornable }]
// }
router.post('/egreso', async (req, res) => {
  const {
    cliente_id, temporada_id, forma_pago_id, fecha, destino_venta, observacion,
    numero_remito: nroPasado,
    items
  } = req.body;

  const itemsArr = Array.isArray(items) && items.length > 0 ? items : [];
  if (!itemsArr.length) return res.status(400).json({ error: 'Se requiere al menos un item' });
  if (!temporada_id) return res.status(400).json({ error: 'Temporada es obligatoria' });
  if (!forma_pago_id) return res.status(400).json({ error: 'Forma de pago es obligatoria' });
  for (const it of itemsArr) {
    if (!it.categoria_id || !it.kilos) return res.status(400).json({ error: 'Cada item requiere categoría y kilos' });
  }

  const pool = await getPool();

  // Auto-asignar sub-lotes FIFO por categoría + sub_categoría
  // Cada item del frontend: { categoria_id, sub_categoria_id, kilos, precio_kilo }
  // Se resuelve en N sub-lotes reales asignados automáticamente
  const asignaciones = []; // [{ sub_lote, kilos_asignados, precio_kilo }]

  for (const it of itemsArr) {
    const dbReq = pool.request();
    let where = "sl.etapa IN ('embalado','vendido_parcial','clasificado') AND sl.lote_padre_id IS NOT NULL AND sl.temporada_id = @tid";
    dbReq.input('tid', sql.Int, parseInt(temporada_id));
    dbReq.input('cat_id', sql.Int, parseInt(it.categoria_id));
    where += ' AND sl.categoria_clasif_id = @cat_id';
    if (it.sub_categoria_id) {
      dbReq.input('scat_id', sql.Int, parseInt(it.sub_categoria_id));
      where += ' AND sl.sub_categoria_id = @scat_id';
    }
    const slRes = await dbReq.query(`
      SELECT sl.id, sl.codigo_interno, sl.kilos, sl.etapa, sl.deposito_actual_id,
             sl.temporada_id, sl.parcela_id,
             ISNULL(p.variedad, '') AS variedad, ISNULL(p.nombre, '') AS parcela,
             ISNULL((SELECT SUM(ri.kilos) FROM RemitoItems ri WHERE ri.sub_lote_id = sl.id), 0) AS kilos_vendidos
      FROM LotesMercaderia sl
      LEFT JOIN Parcelas p ON sl.parcela_id = p.id
      WHERE ${where}
      ORDER BY sl.fecha_envasado ASC, sl.id ASC`);

    let kilosPendientes = parseFloat(it.kilos);
    for (const sl of slRes.recordset) {
      if (kilosPendientes <= 0) break;
      const kgDisp = parseFloat((sl.kilos - sl.kilos_vendidos).toFixed(3));
      if (kgDisp <= 0) continue;
      const kgAsignar = Math.min(kgDisp, kilosPendientes);
      asignaciones.push({ sl, kilos_asignados: kgAsignar, precio_kilo: it.precio_kilo ? parseFloat(it.precio_kilo) : null });
      kilosPendientes -= kgAsignar;
    }
    if (kilosPendientes > 0.01) {
      return res.status(400).json({ error: `Stock insuficiente. Faltan ${kilosPendientes.toFixed(1)} kg de la categoría solicitada` });
    }
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const fechaDate = fecha ? new Date(fecha) : new Date();
    const uid = req.user ? req.user.id : null;
    const usuNombre = req.user ? req.user.nombre : null;

    // Resolver nombre del cliente
    let compradorNombre = '';
    if (cliente_id) {
      const cliRes = await pool.request().input('cid', sql.Int, parseInt(cliente_id))
        .query('SELECT nombre FROM Clientes WHERE id = @cid');
      compradorNombre = cliRes.recordset[0]?.nombre || '';
    }

    // Detectar si es CC
    let esCC = false;
    if (forma_pago_id) {
      const fpRes = await new sql.Request(transaction)
        .input('fpid', sql.Int, parseInt(forma_pago_id))
        .query('SELECT es_cuenta_corriente FROM FormasPago WHERE id = @fpid');
      esCC = fpRes.recordset[0]?.es_cuenta_corriente === true;
    }
    const estadoCobro = esCC ? 'pendiente_cc' : 'cobrado';

    // Número de remito
    const nroRemito = nroPasado || await siguienteNumeroRemito(pool);

    // Totales
    let totalKilos = 0, totalMonto = 0;
    for (const a of asignaciones) {
      totalKilos += a.kilos_asignados;
      totalMonto += a.kilos_asignados * (a.precio_kilo || 0);
    }

    // Crear Remito
    const remitoRes = await new sql.Request(transaction)
      .input('numero',        sql.NVarChar,    nroRemito)
      .input('fecha',         sql.DateTime,    fechaDate)
      .input('cliente_id',    sql.Int,         cliente_id   || null)
      .input('temporada_id',  sql.Int,         temporada_id || null)
      .input('forma_pago_id', sql.Int,         forma_pago_id || null)
      .input('estado',        sql.NVarChar,    estadoCobro)
      .input('total',         sql.Decimal(12,2), totalMonto)
      .input('kilos_total',   sql.Decimal(10,2), totalKilos)
      .input('destino',       sql.NVarChar,    destino_venta || '')
      .input('observacion',   sql.NVarChar,    observacion  || '')
      .input('usuario_nombre',sql.NVarChar,    usuNombre)
      .query(`INSERT INTO Remitos (numero, fecha, cliente_id, temporada_id, forma_pago_id, estado, total, kilos_total, destino, observacion, usuario_nombre)
              OUTPUT INSERTED.id
              VALUES (@numero, @fecha, @cliente_id, @temporada_id, @forma_pago_id, @estado, @total, @kilos_total, @destino, @observacion, @usuario_nombre)`);
    const remitoId = remitoRes.recordset[0].id;

    const firstMovId = { id: null };

    // Por cada asignación (sub-lote resuelto automáticamente)
    for (const a of asignaciones) {
      const sl = a.sl;
      const kilosNum = a.kilos_asignados;
      const precioNum = a.precio_kilo;
      const descripcion = `${sl.codigo_interno} — ${sl.variedad || ''}`;

      // MovimientosDeposito
      const movResult = await new sql.Request(transaction)
        .input('deposito_id',   sql.Int,           sl.deposito_actual_id)
        .input('temporada_id',  sql.Int,           temporada_id)
        .input('parcela_id',    sql.Int,           sl.parcela_id || null)
        .input('tipo',          sql.NVarChar,      'egreso_venta')
        .input('kilos',         sql.Decimal(10,2), kilosNum)
        .input('precio_kilo',   sql.Decimal(10,2), precioNum)
        .input('cliente_id',    sql.Int,           cliente_id      || null)
        .input('comprador',     sql.NVarChar,      compradorNombre)
        .input('variedad',      sql.NVarChar,      descripcion)
        .input('sub_lote_id',   sql.Int,           sl.id)
        .input('destino_venta', sql.NVarChar,      destino_venta   || '')
        .input('forma_pago_id', sql.Int,           forma_pago_id   || null)
        .input('numero_remito', sql.NVarChar,      nroRemito)
        .input('estado_cobro',  sql.NVarChar,      estadoCobro)
        .input('remito_id',     sql.Int,           remitoId)
        .input('fecha',         sql.DateTime,      fechaDate)
        .input('observacion',   sql.NVarChar,      observacion     || '')
        .input('usuario_id',    sql.Int,           uid)
        .query(`INSERT INTO MovimientosDeposito
                (deposito_id, temporada_id, parcela_id, tipo, kilos, precio_kilo,
                 cliente_id, comprador, variedad, sub_lote_id, destino_venta,
                 forma_pago_id, numero_remito, estado_cobro, remito_id, fecha, observacion, usuario_id)
                OUTPUT INSERTED.id
                VALUES (@deposito_id, @temporada_id, @parcela_id, @tipo, @kilos, @precio_kilo,
                        @cliente_id, @comprador, @variedad, @sub_lote_id, @destino_venta,
                        @forma_pago_id, @numero_remito, @estado_cobro, @remito_id, @fecha, @observacion, @usuario_id)`);
      const movId = movResult.recordset[0].id;
      if (!firstMovId.id) firstMovId.id = movId;

      // RemitoItems
      await new sql.Request(transaction)
        .input('remito_id',    sql.Int,           remitoId)
        .input('movimiento_id',sql.Int,           movId)
        .input('deposito_id',  sql.Int,           sl.deposito_actual_id)
        .input('sub_lote_id',  sql.Int,           sl.id)
        .input('variedad',     sql.NVarChar,      descripcion)
        .input('kilos',        sql.Decimal(10,2), kilosNum)
        .input('precio_kilo',  sql.Decimal(10,2), precioNum)
        .input('subtotal',     sql.Decimal(12,2), precioNum ? kilosNum * precioNum : null)
        .query(`INSERT INTO RemitoItems (remito_id, movimiento_id, deposito_id, sub_lote_id, variedad, kilos, precio_kilo, subtotal)
                VALUES (@remito_id, @movimiento_id, @deposito_id, @sub_lote_id, @variedad, @kilos, @precio_kilo, @subtotal)`);

      // StockMercaderia
      await new sql.Request(transaction)
        .input('temporada_id', sql.Int,           temporada_id)
        .input('parcela_id',   sql.Int,           sl.parcela_id  || null)
        .input('kilos',        sql.Decimal(10,2), kilosNum)
        .input('precio_kilo',  sql.Decimal(10,2), precioNum)
        .input('comprador',    sql.NVarChar,      compradorNombre)
        .input('observacion',  sql.NVarChar,      observacion || '')
        .query(`INSERT INTO StockMercaderia (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, comprador, observacion)
                VALUES (@temporada_id, @parcela_id, 'egreso_venta', @kilos, 'deposito', @precio_kilo, @comprador, @observacion)`);

      // Actualizar etapa del sub-lote
      const totalVendido = parseFloat(sl.kilos_vendidos) + kilosNum;
      const nuevaEtapa = totalVendido >= parseFloat(sl.kilos) ? 'vendido' : 'vendido_parcial';
      await new sql.Request(transaction)
        .input('sl_id', sql.Int, sl.id)
        .input('etapa', sql.NVarChar, nuevaEtapa)
        .query(`UPDATE LotesMercaderia SET etapa = @etapa WHERE id = @sl_id`);

      // Financiero por asignación
      if (precioNum && precioNum > 0) {
        const total = kilosNum * precioNum;
        const concepto = `Venta ${nroRemito}${compradorNombre ? ' a ' + compradorNombre : ''} — ${sl.codigo_interno}`;
        if (esCC && cliente_id) {
          await new sql.Request(transaction)
            .input('cliente_id',    sql.Int,           parseInt(cliente_id))
            .input('monto',         sql.Decimal(12,2), total)
            .input('forma_pago_id', sql.Int,           forma_pago_id || null)
            .input('temporada_id',  sql.Int,           temporada_id)
            .input('observacion',   sql.NVarChar,      concepto + (observacion ? ' — ' + observacion : ''))
            .query(`INSERT INTO CuentaCorrienteClientes
                    (cliente_id, tipo, monto, forma_pago_id, temporada_id, stock_mercaderia_id, observacion)
                    VALUES (@cliente_id, 'debito', @monto, @forma_pago_id, @temporada_id, NULL, @observacion)`);
        } else {
          await new sql.Request(transaction)
            .input('concepto',       sql.NVarChar,      concepto)
            .input('monto',          sql.Decimal(12,2), total)
            .input('forma_pago_id',  sql.Int,           forma_pago_id || null)
            .input('temporada_id',   sql.Int,           temporada_id)
            .input('observacion',    sql.NVarChar,      observacion || '')
            .input('usuario_nombre', sql.NVarChar,      usuNombre)
            .query(`INSERT INTO Caja (tipo, concepto, monto, forma_pago_id, temporada_id, observacion, usuario_nombre)
                    VALUES ('ingreso', @concepto, @monto, @forma_pago_id, @temporada_id, @observacion, @usuario_nombre)`);
        }
      }
    }

    await transaction.commit();
    res.json({ ok: true, id: firstMovId.id, remito_id: remitoId, numero_remito: nroRemito });
  } catch (err) {
    await transaction.rollback();
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Registrar descarte de depósito ──────────────────────────────
router.post('/descarte', async (req, res) => {
  const { deposito_id, temporada_id, kilos, fecha, observacion } = req.body;
  if (!deposito_id || !temporada_id || !kilos)
    return res.status(400).json({ error: 'Depósito, temporada y kilos son obligatorios' });
  const pool = await getPool();
  const stockRes = await pool.request()
    .input('did', sql.Int, deposito_id)
    .query(`SELECT ISNULL(SUM(CASE WHEN tipo='ingreso' THEN kilos ELSE 0 END),0) -
                   ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%' THEN kilos ELSE 0 END),0) AS disponible
            FROM MovimientosDeposito WHERE deposito_id = @did`);
  const disponible = parseFloat(stockRes.recordset[0].disponible);
  if (disponible < parseFloat(kilos))
    return res.status(400).json({ error: `Stock insuficiente. Disponible: ${disponible.toFixed(2)} kg` });
  try {
    await pool.request()
      .input('deposito_id',  sql.Int,           deposito_id)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('tipo',         sql.NVarChar,      'egreso_descarte')
      .input('kilos',        sql.Decimal(10,2), parseFloat(kilos))
      .input('fecha',        sql.DateTime,      fecha ? new Date(fecha) : new Date())
      .input('observacion',  sql.NVarChar,      observacion || '')
      .input('usuario_id',   sql.Int,           req.user ? req.user.id : null)
      .query(`INSERT INTO MovimientosDeposito (deposito_id, temporada_id, tipo, kilos, fecha, observacion, usuario_id)
              VALUES (@deposito_id, @temporada_id, @tipo, @kilos, @fecha, @observacion, @usuario_id)`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Devolución de embalaje retornable ──────────────────────────
// Body: { venta_embalaje_id, cantidad }
router.post('/devolucion-embalaje', async (req, res) => {
  const { venta_embalaje_id, cantidad } = req.body;
  if (!venta_embalaje_id || !cantidad || parseFloat(cantidad) <= 0) {
    return res.status(400).json({ error: 'venta_embalaje_id y cantidad son obligatorios' });
  }
  const pool = await getPool();
  try {
    // Obtener datos del embalaje original
    const veRes = await pool.request()
      .input('id', sql.Int, venta_embalaje_id)
      .query(`SELECT ve.id, ve.producto_id, ve.cantidad, ve.cantidad_devuelta,
                     ve.retornable, ve.costo_unitario, ve.movimiento_id
              FROM VentaEmbalaje ve WHERE ve.id = @id`);
    if (!veRes.recordset.length) {
      return res.status(404).json({ error: 'Embalaje de venta no encontrado' });
    }
    const ve = veRes.recordset[0];
    if (!ve.retornable) {
      return res.status(400).json({ error: 'Este embalaje no es retornable' });
    }
    const pendiente = parseFloat(ve.cantidad) - parseFloat(ve.cantidad_devuelta);
    const cantNum   = parseFloat(cantidad);
    if (cantNum > pendiente) {
      return res.status(400).json({ error: `Solo quedan ${pendiente} unidades pendientes de devolución` });
    }

    const uid = req.user ? req.user.id : null;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 1. Actualizar cantidad_devuelta en VentaEmbalaje
      await new sql.Request(transaction)
        .input('id',   sql.Int,           venta_embalaje_id)
        .input('cant', sql.Decimal(10,2), cantNum)
        .query(`UPDATE VentaEmbalaje SET cantidad_devuelta = cantidad_devuelta + @cant WHERE id = @id`);

      // 2. Reponer stock en Productos
      await new sql.Request(transaction)
        .input('pid',  sql.Int,           ve.producto_id)
        .input('cant', sql.Decimal(10,2), cantNum)
        .query(`UPDATE Productos SET stock_actual = stock_actual + @cant WHERE id = @pid`);

      // 3. Registrar ingreso en StockInsumos
      const costoTot = parseFloat((cantNum * parseFloat(ve.costo_unitario)).toFixed(2));
      await new sql.Request(transaction)
        .input('producto_id', sql.Int,           ve.producto_id)
        .input('cantidad',    sql.Decimal(10,2), cantNum)
        .input('costo_total', sql.Decimal(10,2), costoTot)
        .input('usuario_id',  sql.Int,           uid)
        .input('obs',         sql.NVarChar,      `Devolución embalaje venta mov#${ve.movimiento_id}`)
        .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, costo_total, usuario_id, observacion, fecha_hora)
                VALUES (@producto_id, 'devolucion_embalaje', @cantidad, @costo_total, @usuario_id, @obs, GETDATE())`);

      await transaction.commit();
      res.json({ ok: true, pendiente_restante: parseFloat((pendiente - cantNum).toFixed(2)) });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Embalaje de una venta (por movimiento_id) ──────────────────
router.get('/embalaje/:movimiento_id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('mid', sql.Int, req.params.movimiento_id)
      .query(`SELECT ve.id, ve.producto_id, p.nombre AS producto, p.presentacion,
                     ve.cantidad, ve.costo_unitario, ve.costo_total,
                     ve.retornable, ve.cantidad_devuelta,
                     ve.cantidad - ve.cantidad_devuelta AS pendiente_devolucion,
                     ve.fecha_creacion
              FROM VentaEmbalaje ve
              JOIN Productos p ON ve.producto_id = p.id
              WHERE ve.movimiento_id = @mid
              ORDER BY ve.id`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Cajones en circulación (retornables sin devolver) ──────────
router.get('/cajones-circulacion', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 've.retornable = 1 AND ve.cantidad_devuelta < ve.cantidad';
    if (temporada_id) {
      where += ` AND md.temporada_id = @temporada_id`;
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
    }
    const result = await dbReq.query(`
      SELECT p.id AS producto_id, p.nombre AS producto, p.presentacion,
             SUM(ve.cantidad - ve.cantidad_devuelta) AS en_circulacion,
             SUM(ve.cantidad) AS total_enviados,
             SUM(ve.cantidad_devuelta) AS total_devueltos,
             COUNT(DISTINCT ve.movimiento_id) AS ventas
      FROM VentaEmbalaje ve
      JOIN Productos p ON ve.producto_id = p.id
      JOIN MovimientosDeposito md ON ve.movimiento_id = md.id
      WHERE ${where}
      GROUP BY p.id, p.nombre, p.presentacion
      ORDER BY en_circulacion DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ── Ocupación de almacenes ──────────────────────────────────────
router.get('/ocupacion', async (req, res) => {
  try {
    const { tipo_stock, tipo_deposito } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'd.activo = 1';
    if (tipo_deposito) {
      // Soporte para lista separada por comas: tipo_deposito=fruta_fresca,camara_frio
      const tiposArr = tipo_deposito.split(',').map(t => t.trim());
      const tiposPlaceholders = tiposArr.map((t, i) => { dbReq.input(`tipo_dep_${i}`, sql.NVarChar, t); return `@tipo_dep_${i}`; });
      where += ` AND d.tipo_deposito IN (${tiposPlaceholders.join(',')})`;
    } else if (tipo_stock === 'insumos') {
      where += ` AND d.tipo_deposito = 'insumos'`;
    } else if (tipo_stock === 'mercaderia') {
      where += ` AND d.tipo_deposito IN ('fruta_fresca','camara_frio')`;
    }

    if (tipo_stock === 'insumos') {
      // Ocupación desde StockInsumos (por deposito_id)
      const result = await dbReq.query(`
        SELECT d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg,
               ISNULL(SUM(CASE
                 WHEN si.tipo IN ('compra','ingreso_manual') THEN si.cantidad
                 WHEN si.tipo IN ('egreso','aplicacion','merma','vencimiento','perdida') THEN -si.cantidad
                 ELSE 0 END), 0) AS ocupado_kg
        FROM Depositos d
        LEFT JOIN StockInsumos si ON si.deposito_id = d.id
        WHERE ${where}
        GROUP BY d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg
        ORDER BY d.nombre`);
      res.json(result.recordset.map(function(r) {
        const ocup = Math.max(0, parseFloat(r.ocupado_kg) || 0);
        const cap  = parseFloat(r.capacidad_kg) || 0;
        return Object.assign({}, r, {
          ocupado_kg: ocup,
          porcentaje: cap > 0 ? Math.min(100, (ocup / cap) * 100) : null
        });
      }));
    } else {
      // Ocupación desde MovimientosDeposito (fruta fresca y cámara fría)
      const result = await dbReq.query(`
        SELECT d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg,
               ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'    THEN m.kilos ELSE 0 END), 0) -
               ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' THEN m.kilos ELSE 0 END), 0) AS ocupado_kg
        FROM Depositos d
        LEFT JOIN MovimientosDeposito m ON m.deposito_id = d.id
        WHERE ${where}
        GROUP BY d.id, d.nombre, d.tipo, d.tipo_deposito, d.capacidad_kg
        ORDER BY d.nombre`);
      res.json(result.recordset.map(function(r) {
        const ocup = Math.max(0, parseFloat(r.ocupado_kg) || 0);
        const cap  = parseFloat(r.capacidad_kg) || 0;
        return Object.assign({}, r, {
          ocupado_kg: ocup,
          porcentaje: cap > 0 ? Math.min(100, (ocup / cap) * 100) : null
        });
      }));
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
