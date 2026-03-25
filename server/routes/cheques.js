const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Obtener cheques
router.get('/', async (req, res) => {
  try {
    const { tipo, estado, tipo_cheque } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let query = `SELECT c.id, c.tipo, c.tipo_cheque, c.numero, c.banco, c.monto,
                 c.fecha_emision, c.fecha_vencimiento, c.estado, c.observacion,
                 c.id_echeq, c.cbu_origen, c.cuit_emisor,
                 p.nombre AS proveedor
                 FROM Cheques c
                 LEFT JOIN Proveedores p ON c.proveedor_id = p.id
                 WHERE 1=1`;
    if (tipo) {
      query += ` AND c.tipo = @tipo`;
      dbReq.input('tipo', sql.NVarChar, tipo);
    }
    if (estado) {
      query += ` AND c.estado = @estado`;
      dbReq.input('estado', sql.NVarChar, estado);
    }
    if (tipo_cheque) {
      query += ` AND c.tipo_cheque = @tipo_cheque`;
      dbReq.input('tipo_cheque', sql.NVarChar, tipo_cheque);
    }
    query += ` ORDER BY c.fecha_vencimiento ASC`;
    const result = await dbReq.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar cheque
router.post('/', async (req, res) => {
  try {
    const { tipo, tipo_cheque, numero, banco, monto, fecha_emision, fecha_vencimiento,
            proveedor_id, observacion, id_echeq, cbu_origen, cuit_emisor } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('tipo',              sql.NVarChar,    tipo)
      .input('tipo_cheque',       sql.NVarChar,    tipo_cheque   || 'fisico')
      .input('numero',            sql.NVarChar,    numero        || '')
      .input('banco',             sql.NVarChar,    banco         || '')
      .input('monto',             sql.Decimal(12,2), monto)
      .input('fecha_emision',     sql.Date,        fecha_emision || new Date())
      .input('fecha_vencimiento', sql.Date,        fecha_vencimiento || null)
      .input('proveedor_id',      sql.Int,         proveedor_id  || null)
      .input('observacion',       sql.NVarChar,    observacion   || '')
      .input('id_echeq',          sql.NVarChar,    id_echeq      || null)
      .input('cbu_origen',        sql.NVarChar,    cbu_origen    || null)
      .input('cuit_emisor',       sql.NVarChar,    cuit_emisor   || null)
      .query(`INSERT INTO Cheques (tipo, tipo_cheque, numero, banco, monto, fecha_emision,
                fecha_vencimiento, proveedor_id, observacion, id_echeq, cbu_origen, cuit_emisor)
              OUTPUT INSERTED.id
              VALUES (@tipo, @tipo_cheque, @numero, @banco, @monto, @fecha_emision,
                @fecha_vencimiento, @proveedor_id, @observacion, @id_echeq, @cbu_origen, @cuit_emisor)`);
    res.json({ ok: true, id: result.recordset[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cambiar estado de cheque
router.put('/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('estado', sql.NVarChar, estado)
      .query('UPDATE Cheques SET estado = @estado WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;