const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// Obtener lotes activos, opcionalmente filtrados por temporada
router.get('/', async (req, res) => {
  try {
    const { temporada_id } = req.query;
    const pool = await getPool();
    const dbReq = pool.request();
    let where = 'l.activo = 1';
    if (temporada_id) {
      dbReq.input('temporada_id', sql.Int, parseInt(temporada_id));
      where += ' AND l.temporada_id = @temporada_id';
    }
    const result = await dbReq.query(
      `SELECT l.id, l.nombre, l.hectareas, l.variedad, l.cantidad_plantines,
              l.activo, l.temporada_id, t.nombre AS temporada, t.cultivo AS cultivo
       FROM Parcelas l
       LEFT JOIN Temporadas t ON l.temporada_id = t.id
       WHERE ${where} ORDER BY l.nombre`
    );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear parcela
router.post('/', async (req, res) => {
  try {
    const { nombre, hectareas, temporada_id, variedad, cantidad_plantines } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('nombre',             sql.NVarChar,     nombre)
      .input('hectareas',          sql.Decimal(6,2), hectareas          || null)
      .input('temporada_id',       sql.Int,           temporada_id       || null)
      .input('variedad',           sql.NVarChar,     variedad           || '')
      .input('cantidad_plantines', sql.Int,           cantidad_plantines || null)
      .query(`INSERT INTO Parcelas (nombre, hectareas, temporada_id, variedad, cantidad_plantines)
              VALUES (@nombre, @hectareas, @temporada_id, @variedad, @cantidad_plantines)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar parcela
router.put('/:id', async (req, res) => {
  try {
    const { nombre, hectareas, variedad, cantidad_plantines } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id',                 sql.Int,           parseInt(req.params.id))
      .input('nombre',             sql.NVarChar,      nombre)
      .input('hectareas',          sql.Decimal(6,2),  hectareas          || null)
      .input('variedad',           sql.NVarChar,      variedad           || '')
      .input('cantidad_plantines', sql.Int,            cantidad_plantines || null)
      .query(`UPDATE Parcelas
              SET nombre=@nombre, hectareas=@hectareas, variedad=@variedad,
                  cantidad_plantines=@cantidad_plantines
              OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.hectareas,
                     INSERTED.variedad, INSERTED.cantidad_plantines
              WHERE id=@id`);
    if (!result.recordset.length) return res.status(404).json({ error: 'Parcela no encontrada' });
    res.json({ ok: true, parcela: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
