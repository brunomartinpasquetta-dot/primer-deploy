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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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

// ── Registrar venta (uno o varios items de mercadería) ──────────
// Body: {
//   cliente_id, temporada_id, forma_pago_id, fecha, destino_venta, observacion,
//   numero_remito,   // opcional — se genera automáticamente si no se pasa
//   items: [{ deposito_id, variedad, kilos, precio_kilo }],
//   embalaje: [{ producto_id, cantidad, costo_unitario, retornable }]
// }
router.post('/egreso', async (req, res) => {
  const {
    cliente_id, temporada_id, forma_pago_id, fecha, destino_venta, observacion,
    numero_remito: nroPasado,
    items,   // array de líneas de mercadería
    embalaje
  } = req.body;

  // Compatibilidad con llamada de un solo item (legado)
  const itemsArr = Array.isArray(items) && items.length > 0
    ? items
    : [{
        deposito_id:  req.body.deposito_id,
        variedad:     req.body.variedad  || '',
        kilos:        req.body.kilos,
        precio_kilo:  req.body.precio_kilo,
        parcela_id:   req.body.parcela_id || null
      }];

  if (!temporada_id) return res.status(400).json({ error: 'Temporada es obligatoria' });
  if (!forma_pago_id) return res.status(400).json({ error: 'Forma de pago es obligatoria' });
  for (const it of itemsArr) {
    if (!it.deposito_id || !it.kilos) return res.status(400).json({ error: 'Cada item requiere depósito y kilos' });
  }

  const pool = await getPool();

  // Verificar stock por depósito
  for (const it of itemsArr) {
    const sr = await pool.request()
      .input('did', sql.Int, it.deposito_id)
      .query(`SELECT ISNULL(SUM(CASE WHEN tipo='ingreso' THEN kilos ELSE 0 END),0) -
                     ISNULL(SUM(CASE WHEN tipo LIKE 'egreso%' THEN kilos ELSE 0 END),0) AS disponible
              FROM MovimientosDeposito WHERE deposito_id = @did`);
    const disp = parseFloat(sr.recordset[0].disponible);
    if (disp < parseFloat(it.kilos))
      return res.status(400).json({ error: `Stock insuficiente en depósito ${it.deposito_id}. Disponible: ${disp.toFixed(2)} kg` });
  }

  // Verificar stock embalaje
  const embalajeItems = Array.isArray(embalaje) ? embalaje : [];
  for (const item of embalajeItems) {
    const eRes = await pool.request()
      .input('pid', sql.Int, item.producto_id)
      .query('SELECT stock_actual, nombre FROM Productos WHERE id = @pid');
    if (!eRes.recordset.length) return res.status(400).json({ error: `Producto embalaje id ${item.producto_id} no encontrado` });
    const stockAct = parseFloat(eRes.recordset[0].stock_actual) || 0;
    if (stockAct < parseFloat(item.cantidad))
      return res.status(400).json({ error: `Stock insuficiente de embalaje "${eRes.recordset[0].nombre}". Disponible: ${stockAct}` });
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
    for (const it of itemsArr) {
      const kg = parseFloat(it.kilos) || 0;
      const pr = parseFloat(it.precio_kilo) || 0;
      totalKilos += kg;
      totalMonto += kg * pr;
    }

    // Crear Remito
    const remitoRes = await new sql.Request(transaction)
      .input('numero',        sql.NVarChar,    nroRemito)
      .input('fecha',         sql.Date,        fechaDate)
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

    // Por cada item de mercadería
    for (const it of itemsArr) {
      const kilosNum = parseFloat(it.kilos);
      const precioNum = it.precio_kilo ? parseFloat(it.precio_kilo) : null;

      // MovimientosDeposito
      const movResult = await new sql.Request(transaction)
        .input('deposito_id',   sql.Int,           it.deposito_id)
        .input('temporada_id',  sql.Int,           temporada_id)
        .input('parcela_id',    sql.Int,           it.parcela_id   || null)
        .input('tipo',          sql.NVarChar,      'egreso_venta')
        .input('kilos',         sql.Decimal(10,2), kilosNum)
        .input('precio_kilo',   sql.Decimal(10,2), precioNum)
        .input('cliente_id',    sql.Int,           cliente_id      || null)
        .input('comprador',     sql.NVarChar,      compradorNombre)
        .input('variedad',      sql.NVarChar,      it.variedad     || '')
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
                 cliente_id, comprador, variedad, destino_venta,
                 forma_pago_id, numero_remito, estado_cobro, remito_id, fecha, observacion, usuario_id)
                OUTPUT INSERTED.id
                VALUES (@deposito_id, @temporada_id, @parcela_id, @tipo, @kilos, @precio_kilo,
                        @cliente_id, @comprador, @variedad, @destino_venta,
                        @forma_pago_id, @numero_remito, @estado_cobro, @remito_id, @fecha, @observacion, @usuario_id)`);
      const movId = movResult.recordset[0].id;
      if (!firstMovId.id) firstMovId.id = movId;

      // RemitoItems
      await new sql.Request(transaction)
        .input('remito_id',    sql.Int,           remitoId)
        .input('movimiento_id',sql.Int,           movId)
        .input('deposito_id',  sql.Int,           it.deposito_id)
        .input('variedad',     sql.NVarChar,      it.variedad    || '')
        .input('kilos',        sql.Decimal(10,2), kilosNum)
        .input('precio_kilo',  sql.Decimal(10,2), precioNum)
        .input('subtotal',     sql.Decimal(12,2), precioNum ? kilosNum * precioNum : null)
        .query(`INSERT INTO RemitoItems (remito_id, movimiento_id, deposito_id, variedad, kilos, precio_kilo, subtotal)
                VALUES (@remito_id, @movimiento_id, @deposito_id, @variedad, @kilos, @precio_kilo, @subtotal)`);

      // StockMercaderia
      await new sql.Request(transaction)
        .input('temporada_id', sql.Int,           temporada_id)
        .input('parcela_id',   sql.Int,           it.parcela_id  || null)
        .input('kilos',        sql.Decimal(10,2), kilosNum)
        .input('precio_kilo',  sql.Decimal(10,2), precioNum)
        .input('comprador',    sql.NVarChar,      compradorNombre)
        .input('observacion',  sql.NVarChar,      observacion || '')
        .query(`INSERT INTO StockMercaderia (temporada_id, parcela_id, tipo, kilos, destino, precio_kilo, comprador, observacion)
                VALUES (@temporada_id, @parcela_id, 'egreso_venta', @kilos, 'deposito', @precio_kilo, @comprador, @observacion)`);

      // Embalaje solo en el primer item
      if (it === itemsArr[0]) {
        for (const emb of embalajeItems) {
          const cant       = parseFloat(emb.cantidad);
          const costoUnit  = parseFloat(emb.costo_unitario || 0);
          const costoTot   = parseFloat((cant * costoUnit).toFixed(2));
          const retornable = emb.retornable ? 1 : 0;

          await new sql.Request(transaction)
            .input('movimiento_id',  sql.Int,           movId)
            .input('producto_id',    sql.Int,           emb.producto_id)
            .input('cantidad',       sql.Decimal(10,2), cant)
            .input('costo_unitario', sql.Decimal(10,2), costoUnit)
            .input('costo_total',    sql.Decimal(10,2), costoTot)
            .input('retornable',     sql.Bit,           retornable)
            .query(`INSERT INTO VentaEmbalaje (movimiento_id, producto_id, cantidad, costo_unitario, costo_total, retornable)
                    VALUES (@movimiento_id, @producto_id, @cantidad, @costo_unitario, @costo_total, @retornable)`);

          await new sql.Request(transaction)
            .input('pid',  sql.Int,           emb.producto_id)
            .input('cant', sql.Decimal(10,2), cant)
            .query(`UPDATE Productos SET stock_actual = stock_actual - @cant WHERE id = @pid`);

          await new sql.Request(transaction)
            .input('producto_id', sql.Int,           emb.producto_id)
            .input('cantidad',    sql.Decimal(10,2), cant)
            .input('costo_total', sql.Decimal(10,2), costoTot)
            .input('usuario_id',  sql.Int,           uid)
            .input('obs',         sql.NVarChar,      `Embalaje remito ${nroRemito}${retornable ? ' (retornable)' : ''}`)
            .query(`INSERT INTO StockInsumos (producto_id, tipo, cantidad, costo_total, usuario_id, observacion, fecha_hora)
                    VALUES (@producto_id, 'embalaje_venta', @cantidad, @costo_total, @usuario_id, @obs, GETDATE())`);
        }
      }

      // Financiero por item
      if (precioNum && precioNum > 0) {
        const total = kilosNum * precioNum;
        const concepto = `Venta ${nroRemito}${compradorNombre ? ' a ' + compradorNombre : ''}${it.variedad ? ' — ' + it.variedad : ''}`;
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
    res.status(500).json({ error: err.message });
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
    const { tipo_stock, tipo_deposito } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'd.activo = 1';
    if (tipo_deposito) {
      // Soporte para lista separada por comas: tipo_deposito=fruta_fresca,camara_frio
      const tipos = tipo_deposito.split(',').map(t => `'${t.trim().replace(/'/g, '')}'`).join(',');
      where += ` AND d.tipo_deposito IN (${tipos})`;
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
