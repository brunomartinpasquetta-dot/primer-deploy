const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

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
    res.status(500).json({ error: err.message });
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
      where += ` AND d.tipo_stock IN ('insumos','mixto')`;
    } else if (tipo_stock === 'mercaderia') {
      where += ` AND d.tipo_stock IN ('mercaderia','mixto')`;
    }
    const result = await dbReq.query(`
      SELECT d.id, d.nombre, d.tipo, d.tipo_stock, d.capacidad_kg, d.costo_kg_dia,
             d.ubicacion, d.observacion, d.activo,
             ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'         THEN m.kilos ELSE 0 END), 0) -
             ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%'      THEN m.kilos ELSE 0 END), 0) AS stock_actual,
             ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'         THEN m.kilos ELSE 0 END), 0) AS total_ingresado,
             ISNULL(SUM(CASE WHEN m.tipo = 'egreso_venta'    THEN m.kilos ELSE 0 END), 0) AS total_vendido,
             ISNULL(SUM(CASE WHEN m.tipo = 'egreso_descarte' THEN m.kilos ELSE 0 END), 0) AS total_descartado
      FROM Depositos d
      LEFT JOIN MovimientosDeposito m ON d.id = m.deposito_id
      WHERE ${where}
      GROUP BY d.id, d.nombre, d.tipo, d.tipo_stock, d.capacidad_kg, d.costo_kg_dia,
               d.ubicacion, d.observacion, d.activo
      ORDER BY d.nombre`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Crear depósito ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { nombre, tipo, tipo_stock, capacidad_kg, costo_kg_dia, ubicacion, observacion } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
    const tiposStockValidos = ['mercaderia', 'insumos', 'mixto'];
    const tipoStockVal = tiposStockValidos.includes(tipo_stock) ? tipo_stock : 'mercaderia';
    const pool = await getPool();
    const result = await pool.request()
      .input('nombre',       sql.NVarChar,       nombre)
      .input('tipo',         sql.NVarChar,       tipo)
      .input('tipo_stock',   sql.NVarChar,       tipoStockVal)
      .input('capacidad_kg', sql.Decimal(12, 2), capacidad_kg || null)
      .input('costo_kg_dia', sql.Decimal(10, 4), costo_kg_dia || null)
      .input('ubicacion',    sql.NVarChar,       ubicacion    || '')
      .input('observacion',  sql.NVarChar,       observacion  || '')
      .query(`INSERT INTO Depositos (nombre, tipo, tipo_stock, capacidad_kg, costo_kg_dia, ubicacion, observacion)
              OUTPUT INSERTED.id
              VALUES (@nombre, @tipo, @tipo_stock, @capacidad_kg, @costo_kg_dia, @ubicacion, @observacion)`);
    res.json({ ok: true, id: result.recordset[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Editar depósito ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { nombre, tipo, tipo_stock, capacidad_kg, costo_kg_dia, ubicacion, observacion, activo } = req.body;
    const tiposStockValidos = ['mercaderia', 'insumos', 'mixto'];
    const tipoStockVal = tiposStockValidos.includes(tipo_stock) ? tipo_stock : 'mercaderia';
    const pool = await getPool();
    await pool.request()
      .input('id',           sql.Int,            req.params.id)
      .input('nombre',       sql.NVarChar,       nombre)
      .input('tipo',         sql.NVarChar,       tipo)
      .input('tipo_stock',   sql.NVarChar,       tipoStockVal)
      .input('capacidad_kg', sql.Decimal(12, 2), capacidad_kg || null)
      .input('costo_kg_dia', sql.Decimal(10, 4), costo_kg_dia || null)
      .input('ubicacion',    sql.NVarChar,       ubicacion    || '')
      .input('observacion',  sql.NVarChar,       observacion  || '')
      .input('activo',       sql.Bit,            activo !== undefined ? (activo ? 1 : 0) : 1)
      .query(`UPDATE Depositos SET nombre=@nombre, tipo=@tipo, tipo_stock=@tipo_stock,
              capacidad_kg=@capacidad_kg, costo_kg_dia=@costo_kg_dia, ubicacion=@ubicacion,
              observacion=@observacion, activo=@activo WHERE id=@id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ── Registrar egreso del depósito (venta o descarte) ───────────
// Body: { deposito_id, temporada_id, parcela_id, tipo_egreso, kilos,
//         precio_kilo, cliente_id, comprador, variedad, destino_venta,
//         fecha, observacion,
//         embalaje?: [{ producto_id, cantidad, costo_unitario, retornable }] }
router.post('/egreso', async (req, res) => {
  const { deposito_id, temporada_id, parcela_id, tipo_egreso, kilos,
          precio_kilo, cliente_id, comprador, variedad,
          destino_venta, fecha, observacion, embalaje } = req.body;
  if (!deposito_id || !temporada_id || !kilos || !tipo_egreso) {
    return res.status(400).json({ error: 'Depósito, temporada, tipo y kilos son obligatorios' });
  }
  const tiposValidos = ['egreso_venta', 'egreso_descarte'];
  if (!tiposValidos.includes(tipo_egreso)) {
    return res.status(400).json({ error: 'tipo_egreso debe ser egreso_venta o egreso_descarte' });
  }
  const pool = await getPool();

  // Verificar stock suficiente (fuera de transacción — lectura previa)
  const stockRes = await pool.request()
    .input('did', sql.Int, deposito_id)
    .query(`SELECT
              ISNULL(SUM(CASE WHEN tipo='ingreso' THEN kilos ELSE 0 END),0) -
              ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%' THEN kilos ELSE 0 END),0) AS disponible
            FROM MovimientosDeposito WHERE deposito_id = @did`);
  const disponible = parseFloat(stockRes.recordset[0].disponible);
  if (disponible < parseFloat(kilos)) {
    return res.status(400).json({ error: `Stock insuficiente. Disponible: ${disponible.toFixed(2)} kg` });
  }

  // Verificar stock de insumos de embalaje (solo no retornables descuentan stock productivo,
  // pero todos deben tener stock disponible para ser despachados)
  const embalajeItems = Array.isArray(embalaje) ? embalaje : [];
  for (const item of embalajeItems) {
    const eRes = await pool.request()
      .input('pid', sql.Int, item.producto_id)
      .query('SELECT stock_actual, nombre FROM Productos WHERE id = @pid');
    if (!eRes.recordset.length) {
      return res.status(400).json({ error: `Producto de embalaje id ${item.producto_id} no encontrado` });
    }
    const stockAct = parseFloat(eRes.recordset[0].stock_actual) || 0;
    if (stockAct < parseFloat(item.cantidad)) {
      return res.status(400).json({
        error: `Stock insuficiente de embalaje "${eRes.recordset[0].nombre}". Disponible: ${stockAct}`
      });
    }
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const fechaDate = fecha ? new Date(fecha) : new Date();
    const kilosNum  = parseFloat(kilos);
    const precioNum = precio_kilo ? parseFloat(precio_kilo) : null;
    const uid = req.user ? req.user.id : null;

    // Resolver nombre del cliente si viene cliente_id
    let compradorNombre = comprador || '';
    if (cliente_id && !compradorNombre) {
      const cliRes = await pool.request()
        .input('cid', sql.Int, parseInt(cliente_id))
        .query('SELECT nombre FROM Clientes WHERE id = @cid');
      compradorNombre = cliRes.recordset[0]?.nombre || '';
    }

    // 1. MovimientosDeposito
    const movResult = await new sql.Request(transaction)
      .input('deposito_id',  sql.Int,           deposito_id)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('parcela_id',      sql.Int,           parcela_id       || null)
      .input('tipo',         sql.NVarChar,      tipo_egreso)
      .input('kilos',        sql.Decimal(10,2), kilosNum)
      .input('precio_kilo',  sql.Decimal(10,2), precioNum)
      .input('cliente_id',   sql.Int,           cliente_id    || null)
      .input('comprador',    sql.NVarChar,      compradorNombre)
      .input('variedad',     sql.NVarChar,      variedad      || '')
      .input('destino_venta',sql.NVarChar,      destino_venta || '')
      .input('fecha',        sql.DateTime,      fechaDate)
      .input('observacion',  sql.NVarChar,      observacion   || '')
      .input('usuario_id',   sql.Int,           uid)
      .query(`INSERT INTO MovimientosDeposito
              (deposito_id, temporada_id, parcela_id, tipo, kilos, precio_kilo,
               cliente_id, comprador, variedad, destino_venta, fecha, observacion, usuario_id)
              OUTPUT INSERTED.id
              VALUES (@deposito_id, @temporada_id, @parcela_id, @tipo, @kilos, @precio_kilo,
                      @cliente_id, @comprador, @variedad, @destino_venta, @fecha, @observacion, @usuario_id)`);

    const movId = movResult.recordset[0].id;

    // 2. StockMercaderia — egreso de kg
    await new sql.Request(transaction)
      .input('temporada_id', sql.Int,           temporada_id)
      .input('parcela_id',      sql.Int,           parcela_id || null)
      .input('kilos',        sql.Decimal(10,2), kilosNum)
      .input('precio_kilo',  sql.Decimal(10,2), precioNum)
      .input('comprador',    sql.NVarChar,      comprador || '')
      .input('tipo_sm',      sql.NVarChar,      tipo_egreso)
      .input('destino',      sql.NVarChar,      tipo_egreso === 'egreso_venta' ? 'deposito' : 'descarte')
      .input('observacion',  sql.NVarChar,      observacion || '')
      .query(`INSERT INTO StockMercaderia (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, comprador, observacion)
              VALUES (@temporada_id, @parcela_id, @tipo_sm, @kilos, @destino, @precio_kilo, @comprador, @observacion)`);

    // 3. Embalaje — VentaEmbalaje + egreso StockInsumos por cada ítem
    for (const item of embalajeItems) {
      const cant        = parseFloat(item.cantidad);
      const costoUnit   = parseFloat(item.costo_unitario || 0);
      const costoTot    = parseFloat((cant * costoUnit).toFixed(2));
      const retornable  = item.retornable ? 1 : 0;

      await new sql.Request(transaction)
        .input('movimiento_id',  sql.Int,           movId)
        .input('producto_id',    sql.Int,           item.producto_id)
        .input('cantidad',       sql.Decimal(10,2), cant)
        .input('costo_unitario', sql.Decimal(10,2), costoUnit)
        .input('costo_total',    sql.Decimal(10,2), costoTot)
        .input('retornable',     sql.Bit,           retornable)
        .query(`INSERT INTO VentaEmbalaje (movimiento_id, producto_id, cantidad, costo_unitario, costo_total, retornable)
                VALUES (@movimiento_id, @producto_id, @cantidad, @costo_unitario, @costo_total, @retornable)`);

      // Descontar stock de Productos siempre (retornables también salen del depósito)
      await new sql.Request(transaction)
        .input('pid',  sql.Int,           item.producto_id)
        .input('cant', sql.Decimal(10,2), cant)
        .query(`UPDATE Productos SET stock_actual = stock_actual - @cant WHERE id = @pid`);

      // Registrar egreso en StockInsumos
      await new sql.Request(transaction)
        .input('producto_id', sql.Int,           item.producto_id)
        .input('cantidad',    sql.Decimal(10,2), cant)
        .input('costo_total', sql.Decimal(10,2), costoTot)
        .input('usuario_id',  sql.Int,           uid)
        .input('obs',         sql.NVarChar,      `Embalaje venta mov#${movId}${retornable ? ' (retornable)' : ''}`)
        .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, costo_total, usuario_id, observacion, fecha_hora)
                VALUES (@producto_id, 'embalaje_venta', @cantidad, @costo_total, @usuario_id, @obs, GETDATE())`);
    }

    // 4. Caja — solo si es venta y hay precio
    if (tipo_egreso === 'egreso_venta' && precioNum && precioNum > 0) {
      const total = kilosNum * precioNum;
      await new sql.Request(transaction)
        .input('concepto',     sql.NVarChar,      `Venta mercadería${comprador ? ' a ' + comprador : ''}`)
        .input('monto',        sql.Decimal(12,2), total)
        .input('temporada_id', sql.Int,           temporada_id)
        .input('observacion',  sql.NVarChar,      observacion || '')
        .query(`INSERT INTO Caja (tipo, concepto, monto, temporada_id, observacion)
                VALUES ('ingreso', @concepto, @monto, @temporada_id, @observacion)`);
    }

    await transaction.commit();
    res.json({ ok: true, id: movId });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ── Ocupación de almacenes ──────────────────────────────────────
router.get('/ocupacion', async (req, res) => {
  try {
    const { tipo_stock } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'd.activo = 1';
    if (tipo_stock === 'insumos') {
      where += ` AND d.tipo_stock IN ('insumos','mixto')`;
    } else if (tipo_stock === 'mercaderia') {
      where += ` AND d.tipo_stock IN ('mercaderia','mixto')`;
    }

    if (tipo_stock === 'insumos') {
      // Ocupación desde StockInsumos (por deposito_id)
      const result = await dbReq.query(`
        SELECT d.id, d.nombre, d.tipo, d.tipo_stock, d.capacidad_kg,
               ISNULL(SUM(CASE
                 WHEN si.tipo IN ('compra','ingreso_manual') THEN si.cantidad
                 WHEN si.tipo IN ('egreso','aplicacion','merma','vencimiento','perdida') THEN -si.cantidad
                 ELSE 0 END), 0) AS ocupado_kg
        FROM Depositos d
        LEFT JOIN StockInsumos si ON si.deposito_id = d.id
        WHERE ${where}
        GROUP BY d.id, d.nombre, d.tipo, d.tipo_stock, d.capacidad_kg
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
      // Ocupación desde MovimientosDeposito (mercadería y mixto)
      const result = await dbReq.query(`
        SELECT d.id, d.nombre, d.tipo, d.tipo_stock, d.capacidad_kg,
               ISNULL(SUM(CASE WHEN m.tipo = 'ingreso'    THEN m.kilos ELSE 0 END), 0) -
               ISNULL(SUM(CASE WHEN m.tipo LIKE 'egreso%' THEN m.kilos ELSE 0 END), 0) AS ocupado_kg
        FROM Depositos d
        LEFT JOIN MovimientosDeposito m ON m.deposito_id = d.id
        WHERE ${where}
        GROUP BY d.id, d.nombre, d.tipo, d.tipo_stock, d.capacidad_kg
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
