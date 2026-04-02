const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Valid state transitions for recibido cheques
const TRANSICIONES_RECIBIDO = {
  en_cartera: ['depositado', 'endosado', 'rechazado'],
  depositado:  ['acreditado', 'rechazado'],
  acreditado:  [],
  rechazado:   [],
  endosado:    [],
  entregado:   []
};

// Valid state transitions for emitido cheques
const TRANSICIONES_EMITIDO = {
  en_cartera: ['entregado', 'rechazado'],
  entregado:  ['rechazado'],
  rechazado:  [],
  depositado: [],
  acreditado: [],
  endosado:   []
};

// ── Resumen KPI ─────────────────────────────────────────────────
router.get('/resumen', async (req, res) => {
  try {
    const pool = await getPool();
    const hoy = new Date().toISOString().slice(0, 10);
    const result = await pool.request()
      .input('hoy', sql.Date, hoy)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN tipo='recibido' AND estado='en_cartera'  THEN monto ELSE 0 END), 0) AS cartera_importe,
          COUNT(CASE WHEN tipo='recibido' AND estado='en_cartera'       THEN 1 END) AS cartera_cantidad,
          ISNULL(SUM(CASE WHEN tipo='recibido' AND estado='en_cartera'
                          AND fecha_vencimiento <= DATEADD(day,7,@hoy)
                          AND fecha_vencimiento >= @hoy                  THEN monto ELSE 0 END), 0) AS proximos_importe,
          COUNT(CASE WHEN tipo='recibido' AND estado='en_cartera'
                     AND fecha_vencimiento < @hoy                        THEN 1 END) AS vencidos_cantidad,
          ISNULL(SUM(CASE WHEN tipo='recibido' AND estado='depositado'  THEN monto ELSE 0 END), 0) AS depositado_importe
        FROM Cheques
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Listar cheques ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { tipo, estado, tipo_cheque } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = '1=1';
    if (tipo)        { where += ' AND c.tipo = @tipo';             dbReq.input('tipo',       sql.NVarChar, tipo); }
    if (estado)      { where += ' AND c.estado = @estado';         dbReq.input('estado',     sql.NVarChar, estado); }
    if (tipo_cheque) { where += ' AND c.tipo_cheque = @tipo_cheque'; dbReq.input('tipo_cheque', sql.NVarChar, tipo_cheque); }

    const result = await dbReq.query(`
      SELECT c.id, c.tipo, c.tipo_cheque, c.numero, c.banco,
             c.emisor, c.receptor, c.origen, c.monto,
             c.fecha_emision, c.fecha_vencimiento, c.estado,
             c.observacion, c.id_echeq, c.cbu_origen, c.cuit_emisor,
             c.created_at,
             p.nombre AS proveedor,
             cl.nombre AS cliente
      FROM Cheques c
      LEFT JOIN Proveedores p  ON c.proveedor_id = p.id
      LEFT JOIN Clientes    cl ON c.cliente_id   = cl.id
      WHERE ${where}
      ORDER BY c.fecha_vencimiento ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Registrar cheque ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { tipo, tipo_cheque, numero, banco, emisor, receptor, monto,
            fecha_emision, fecha_vencimiento, proveedor_id, cliente_id,
            origen, observacion, id_echeq, cbu_origen, cuit_emisor } = req.body;
    if (!monto || parseFloat(monto) <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (!fecha_vencimiento) return res.status(400).json({ error: 'Fecha de vencimiento requerida' });

    const estadoInicial = tipo === 'emitido' ? 'entregado' : 'en_cartera';
    const pool = await getPool();
    const result = await pool.request()
      .input('tipo',              sql.NVarChar,      tipo)
      .input('tipo_cheque',       sql.NVarChar,      tipo_cheque    || 'fisico')
      .input('numero',            sql.NVarChar,      numero         || '')
      .input('banco',             sql.NVarChar,      banco          || '')
      .input('emisor',            sql.NVarChar,      emisor         || '')
      .input('receptor',          sql.NVarChar,      receptor       || '')
      .input('monto',             sql.Decimal(12,2), monto)
      .input('fecha_emision',     sql.Date,          fecha_emision  || new Date())
      .input('fecha_vencimiento', sql.Date,          fecha_vencimiento)
      .input('proveedor_id',      sql.Int,           proveedor_id   || null)
      .input('cliente_id',        sql.Int,           cliente_id     || null)
      .input('origen',            sql.NVarChar,      origen         || 'manual')
      .input('estado',            sql.NVarChar,      estadoInicial)
      .input('observacion',       sql.NVarChar,      observacion    || '')
      .input('id_echeq',          sql.NVarChar,      id_echeq       || null)
      .input('cbu_origen',        sql.NVarChar,      cbu_origen     || null)
      .input('cuit_emisor',       sql.NVarChar,      cuit_emisor    || null)
      .query(`INSERT INTO Cheques
                (tipo, tipo_cheque, numero, banco, emisor, receptor, monto,
                 fecha_emision, fecha_vencimiento, proveedor_id, cliente_id,
                 origen, estado, observacion, id_echeq, cbu_origen, cuit_emisor)
              OUTPUT INSERTED.id
              VALUES
                (@tipo, @tipo_cheque, @numero, @banco, @emisor, @receptor, @monto,
                 @fecha_emision, @fecha_vencimiento, @proveedor_id, @cliente_id,
                 @origen, @estado, @observacion, @id_echeq, @cbu_origen, @cuit_emisor)`);
    const chequeId = result.recordset[0].id;

    // Log creation movement
    await pool.request()
      .input('cheque_id',   sql.Int,       chequeId)
      .input('tipo',        sql.NVarChar,  'creado')
      .input('descripcion', sql.NVarChar,  `Cheque registrado en estado: ${estadoInicial}`)
      .query(`INSERT INTO ChequeMovimientos (cheque_id, tipo, descripcion)
              VALUES (@cheque_id, @tipo, @descripcion)`);

    res.json({ ok: true, id: chequeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Depositar (recibido: en_cartera → depositado) ──────────────
router.post('/:id/depositar', async (req, res) => {
  try {
    const chequeId = parseInt(req.params.id);
    const { descripcion } = req.body;
    const pool = await getPool();

    const actual = await pool.request()
      .input('id', sql.Int, chequeId)
      .query('SELECT estado, tipo FROM Cheques WHERE id = @id');
    if (!actual.recordset.length) return res.status(404).json({ error: 'Cheque no encontrado' });

    const { estado, tipo } = actual.recordset[0];
    const trans = tipo === 'emitido' ? TRANSICIONES_EMITIDO : TRANSICIONES_RECIBIDO;
    if (!trans[estado] || !trans[estado].includes('depositado')) {
      return res.status(400).json({ error: `No se puede depositar desde estado "${estado}"` });
    }

    await pool.request()
      .input('id',    sql.Int,      chequeId)
      .input('estado', sql.NVarChar, 'depositado')
      .query('UPDATE Cheques SET estado = @estado WHERE id = @id');

    await pool.request()
      .input('cheque_id',   sql.Int,      chequeId)
      .input('tipo',        sql.NVarChar, 'deposito')
      .input('descripcion', sql.NVarChar, descripcion || 'Depositado en banco')
      .query(`INSERT INTO ChequeMovimientos (cheque_id, tipo, descripcion)
              VALUES (@cheque_id, @tipo, @descripcion)`);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Acreditar (depositado → acreditado + impacta Caja) ─────────
router.post('/:id/acreditar', async (req, res) => {
  try {
    const chequeId = parseInt(req.params.id);
    const { temporada_id, descripcion } = req.body;
    const pool = await getPool();

    const actual = await pool.request()
      .input('id', sql.Int, chequeId)
      .query('SELECT estado, tipo, monto, numero, banco, emisor FROM Cheques WHERE id = @id');
    if (!actual.recordset.length) return res.status(404).json({ error: 'Cheque no encontrado' });

    const ch = actual.recordset[0];
    if (ch.estado !== 'depositado') {
      return res.status(400).json({ error: `Solo se puede acreditar desde "depositado". Estado actual: "${ch.estado}"` });
    }
    if (ch.tipo !== 'recibido') {
      return res.status(400).json({ error: 'Solo cheques recibidos pueden acreditarse en caja' });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 1. Update cheque state
      await new sql.Request(transaction)
        .input('id',    sql.Int,      chequeId)
        .input('estado', sql.NVarChar, 'acreditado')
        .query('UPDATE Cheques SET estado = @estado WHERE id = @id');

      // 2. Insert into Caja (now real cash)
      const concepto = `Cheque acreditado — ${ch.banco || ''} ${ch.numero || ''} ${ch.emisor ? '(' + ch.emisor + ')' : ''}`.trim();
      await new sql.Request(transaction)
        .input('tipo',            sql.NVarChar,    'ingreso')
        .input('concepto',        sql.NVarChar,    concepto)
        .input('monto',           sql.Decimal(12,2), ch.monto)
        .input('medio_pago',      sql.NVarChar,    'cheque')
        .input('cheque_id',       sql.Int,         chequeId)
        .input('fecha',           sql.Date,        new Date())
        .input('temporada_id',    sql.Int,         temporada_id || null)
        .input('observacion',     sql.NVarChar,    descripcion || '')
        .input('usuario_nombre',  sql.NVarChar,    req.user ? req.user.nombre : null)
        .query(`INSERT INTO Caja (tipo, concepto, monto, medio_pago, cheque_id, fecha, temporada_id, observacion, usuario_nombre)
                VALUES (@tipo, @concepto, @monto, @medio_pago, @cheque_id, @fecha, @temporada_id, @observacion, @usuario_nombre)`);

      // 3. Audit log
      await new sql.Request(transaction)
        .input('cheque_id',   sql.Int,      chequeId)
        .input('tipo',        sql.NVarChar, 'acreditacion')
        .input('descripcion', sql.NVarChar, descripcion || 'Acreditado — impacta caja')
        .query(`INSERT INTO ChequeMovimientos (cheque_id, tipo, descripcion)
                VALUES (@cheque_id, @tipo, @descripcion)`);

      await transaction.commit();
      res.json({ ok: true });
    } catch (inner) {
      await transaction.rollback();
      throw inner;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rechazar ────────────────────────────────────────────────────
router.post('/:id/rechazar', async (req, res) => {
  try {
    const chequeId = parseInt(req.params.id);
    const { descripcion } = req.body;
    const pool = await getPool();

    const actual = await pool.request()
      .input('id', sql.Int, chequeId)
      .query('SELECT estado, tipo FROM Cheques WHERE id = @id');
    if (!actual.recordset.length) return res.status(404).json({ error: 'Cheque no encontrado' });

    const { estado, tipo } = actual.recordset[0];
    const trans = tipo === 'emitido' ? TRANSICIONES_EMITIDO : TRANSICIONES_RECIBIDO;
    if (!trans[estado] || !trans[estado].includes('rechazado')) {
      return res.status(400).json({ error: `No se puede rechazar desde estado "${estado}"` });
    }

    await pool.request()
      .input('id',     sql.Int,      chequeId)
      .input('estado', sql.NVarChar, 'rechazado')
      .query('UPDATE Cheques SET estado = @estado WHERE id = @id');

    await pool.request()
      .input('cheque_id',   sql.Int,      chequeId)
      .input('tipo',        sql.NVarChar, 'rechazo')
      .input('descripcion', sql.NVarChar, descripcion || 'Cheque rechazado')
      .query(`INSERT INTO ChequeMovimientos (cheque_id, tipo, descripcion)
              VALUES (@cheque_id, @tipo, @descripcion)`);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Endosar (transferir a tercero) ──────────────────────────────
router.post('/:id/endosar', async (req, res) => {
  try {
    const chequeId = parseInt(req.params.id);
    const { descripcion } = req.body;
    const pool = await getPool();

    const actual = await pool.request()
      .input('id', sql.Int, chequeId)
      .query('SELECT estado, tipo FROM Cheques WHERE id = @id');
    if (!actual.recordset.length) return res.status(404).json({ error: 'Cheque no encontrado' });

    const { estado, tipo } = actual.recordset[0];
    if (tipo !== 'recibido') return res.status(400).json({ error: 'Solo se pueden endosar cheques recibidos' });
    if (estado !== 'en_cartera') return res.status(400).json({ error: `Solo se puede endosar desde "en_cartera". Estado actual: "${estado}"` });

    await pool.request()
      .input('id',     sql.Int,      chequeId)
      .input('estado', sql.NVarChar, 'endosado')
      .query('UPDATE Cheques SET estado = @estado WHERE id = @id');

    await pool.request()
      .input('cheque_id',   sql.Int,      chequeId)
      .input('tipo',        sql.NVarChar, 'endoso')
      .input('descripcion', sql.NVarChar, descripcion || 'Cheque endosado a tercero')
      .query(`INSERT INTO ChequeMovimientos (cheque_id, tipo, descripcion)
              VALUES (@cheque_id, @tipo, @descripcion)`);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Historial de movimientos de un cheque ───────────────────────
router.get('/:id/movimientos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT tipo, fecha, descripcion
              FROM ChequeMovimientos
              WHERE cheque_id = @id
              ORDER BY fecha ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
