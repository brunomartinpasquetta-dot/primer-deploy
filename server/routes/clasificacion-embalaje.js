const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// EMPLEADOS DEL LOTE (clasificadores — pago por hora, multi-jornada)
// ══════════════════════════════════════════════════════════════════════════════

// GET /lote/:id/clasificadores — Todas las jornadas agrupadas por fecha
router.get('/lote/:id/clasificadores', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('lote_id', sql.Int, parseInt(req.params.id))
      .query(`SELECT lc.id, lc.empleado_id, lc.fecha, lc.hora_inicio, lc.hora_fin,
                     j.apellido + ', ' + j.nombre AS nombre
              FROM LoteClasificadores lc
              JOIN Juntadores j ON lc.empleado_id = j.id
              WHERE lc.lote_id = @lote_id
              ORDER BY lc.fecha DESC, j.apellido`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /lote/:id/clasificador — Agregar empleado a la jornada de hoy
router.post('/lote/:id/clasificador', async (req, res) => {
  try {
    const { empleado_id, hora_inicio } = req.body;
    if (!empleado_id) return res.status(400).json({ error: 'empleado_id es obligatorio' });

    const pool = await getPool();
    await pool.request()
      .input('lote_id', sql.Int, parseInt(req.params.id))
      .input('empleado_id', sql.Int, empleado_id)
      .input('hora_inicio', sql.DateTime, hora_inicio ? new Date(hora_inicio) : null)
      .query(`IF NOT EXISTS (
                SELECT 1 FROM LoteClasificadores
                WHERE lote_id = @lote_id AND empleado_id = @empleado_id AND fecha = CAST(GETDATE() AS DATE)
              )
              INSERT INTO LoteClasificadores (lote_id, empleado_id, fecha, hora_inicio)
              VALUES (@lote_id, @empleado_id, CAST(GETDATE() AS DATE), @hora_inicio)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /lote/:id/clasificador/:id_registro — Actualizar hora inicio/fin de un registro
router.put('/lote/:id/clasificador/:regId', async (req, res) => {
  try {
    const { hora_inicio, hora_fin } = req.body;
    const pool = await getPool();
    const sets = [];
    const request = pool.request()
      .input('id', sql.Int, parseInt(req.params.regId));

    if (hora_inicio !== undefined) {
      request.input('hora_inicio', sql.DateTime, hora_inicio ? new Date(hora_inicio) : null);
      sets.push('hora_inicio = @hora_inicio');
    }
    if (hora_fin !== undefined) {
      request.input('hora_fin', sql.DateTime, hora_fin ? new Date(hora_fin) : null);
      sets.push('hora_fin = @hora_fin');
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });

    await request.query(`UPDATE LoteClasificadores SET ${sets.join(', ')} WHERE id = @id`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /lote/:id/clasificador/:id_registro — Quitar registro
router.delete('/lote/:id/clasificador/:regId', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.regId))
      .query('DELETE FROM LoteClasificadores WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /lote/:id/iniciar-jornada — Setear hora_inicio a todos los empleados de hoy
router.post('/lote/:id/iniciar-jornada', async (req, res) => {
  try {
    const pool = await getPool();
    const loteId = parseInt(req.params.id);
    const hora = req.body.hora_inicio ? new Date(req.body.hora_inicio) : new Date();

    // Verificar que hay empleados hoy
    const check = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .query(`SELECT COUNT(*) AS cnt FROM LoteClasificadores
              WHERE lote_id = @lote_id AND fecha = CAST(GETDATE() AS DATE)`);

    if (check.recordset[0].cnt === 0) {
      return res.status(400).json({ error: 'No hay empleados asignados para hoy' });
    }

    await pool.request()
      .input('lote_id', sql.Int, loteId)
      .input('hora_inicio', sql.DateTime, hora)
      .query(`UPDATE LoteClasificadores SET hora_inicio = @hora_inicio
              WHERE lote_id = @lote_id AND fecha = CAST(GETDATE() AS DATE)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /lote/:id/finalizar-jornada — Setear hora_fin a todos los empleados de hoy
router.post('/lote/:id/finalizar-jornada', async (req, res) => {
  try {
    const pool = await getPool();
    const loteId = parseInt(req.params.id);
    const hora = req.body.hora_fin ? new Date(req.body.hora_fin) : new Date();

    await pool.request()
      .input('lote_id', sql.Int, loteId)
      .input('hora_fin', sql.DateTime, hora)
      .query(`UPDATE LoteClasificadores SET hora_fin = @hora_fin
              WHERE lote_id = @lote_id AND fecha = CAST(GETDATE() AS DATE) AND hora_inicio IS NOT NULL`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PENDIENTES DE CLASIFICACIÓN
// ══════════════════════════════════════════════════════════════════════════════

// GET /pendientes — Lotes disponibles para clasificación Y embalaje
// Incluye: despalillados pendientes de clasificar + clasificados pendientes de embalar
router.get('/pendientes', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT l.id,
                     l.codigo_interno,
                     l.kilos                   AS kilos_cosecha,
                     l.merma_despalillado       AS merma,
                     l.estado,
                     l.etapa,
                     l.fecha_inicio,
                     l.fecha_fin,
                     l.temporada_id,
                     l.parcela_id,
                     p.nombre                  AS parcela,
                     dep.nombre                AS deposito,
                     ISNULL(dsp.kilos_despalillados, 0) AS kilos_despalillados,
                     ISNULL(cls.kilos_clasificados, 0)  AS kilos_clasificados,
                     ISNULL(emb.kilos_embalados, 0)     AS kilos_embalados
              FROM LotesMercaderia l
              LEFT JOIN Parcelas  p   ON l.parcela_id  = p.id
              LEFT JOIN Depositos dep ON l.deposito_id  = dep.id
              LEFT JOIN (
                SELECT lote_id, SUM(kilos) AS kilos_despalillados
                FROM Despalillado WHERE estado != 'anulada'
                GROUP BY lote_id
              ) dsp ON dsp.lote_id = l.id
              LEFT JOIN (
                SELECT lote_id, SUM(kilos) AS kilos_clasificados
                FROM Clasificacion WHERE estado != 'anulada'
                GROUP BY lote_id
              ) cls ON cls.lote_id = l.id
              LEFT JOIN (
                SELECT sl.lote_padre_id, SUM(ISNULL(e.total, 0)) AS kilos_embalados
                FROM LotesMercaderia sl
                LEFT JOIN (
                  SELECT sub_lote_id, SUM(kilos) AS total
                  FROM Embalaje WHERE estado != 'anulada'
                  GROUP BY sub_lote_id
                ) e ON e.sub_lote_id = sl.id
                WHERE sl.lote_padre_id IS NOT NULL AND sl.estado != 'anulada'
                GROUP BY sl.lote_padre_id
              ) emb ON emb.lote_padre_id = l.id
              WHERE l.lote_padre_id IS NULL
                AND l.estado IN ('despalillado', 'en_clasificacion', 'clasificado')
                AND (
                  ISNULL(dsp.kilos_despalillados, 0) > ISNULL(cls.kilos_clasificados, 0)
                  OR ISNULL(cls.kilos_clasificados, 0) > ISNULL(emb.kilos_embalados, 0)
                )
              ORDER BY l.fecha_inicio ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /lote/:id/detalle — Detalle de un lote para clasificar (kg por categoría ya clasificados)
router.get('/lote/:id/detalle', async (req, res) => {
  try {
    const pool = await getPool();
    const loteId = parseInt(req.params.id);

    // Info del lote
    const loteRes = await pool.request()
      .input('id', sql.Int, loteId)
      .query(`SELECT l.id, l.codigo_interno, l.kilos AS kilos_cosecha,
                     l.merma_despalillado AS merma, l.temporada_id, l.parcela_id,
                     p.nombre AS parcela,
                     ISNULL(dsp.total, 0) AS kilos_despalillados
              FROM LotesMercaderia l
              LEFT JOIN Parcelas p ON l.parcela_id = p.id
              LEFT JOIN (
                SELECT lote_id, SUM(kilos) AS total
                FROM Despalillado WHERE estado != 'anulada'
                GROUP BY lote_id
              ) dsp ON dsp.lote_id = l.id
              WHERE l.id = @id`);

    if (!loteRes.recordset.length) return res.status(404).json({ error: 'Lote no encontrado' });

    // Clasificaciones del lote agrupadas por categoría + sub-categoría
    const clasifRes = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .query(`SELECT c.categoria_clasif_id, cc.nombre AS categoria,
                     c.sub_categoria_id, sc.nombre AS sub_categoria,
                     SUM(c.kilos) AS kilos_clasificados,
                     COUNT(*) AS registros
              FROM Clasificacion c
              LEFT JOIN CategoriasClasificacion cc ON c.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON c.sub_categoria_id = sc.id
              WHERE c.lote_id = @lote_id AND c.estado != 'anulada'
              GROUP BY c.categoria_clasif_id, cc.nombre, c.sub_categoria_id, sc.nombre
              ORDER BY cc.nombre, sc.nombre`);

    // Registros individuales de clasificación
    const registrosRes = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .query(`SELECT c.id, c.kilos, c.fecha_hora, c.estado,
                     c.categoria_clasif_id, cc.nombre AS categoria,
                     c.sub_categoria_id, sc.nombre AS sub_categoria,
                     u.nombre AS usuario
              FROM Clasificacion c
              LEFT JOIN CategoriasClasificacion cc ON c.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON c.sub_categoria_id = sc.id
              LEFT JOIN Usuarios u ON c.usuario_id = u.id
              WHERE c.lote_id = @lote_id
              ORDER BY c.fecha_hora DESC`);

    res.json({
      lote: loteRes.recordset[0],
      resumen_categorias: clasifRes.recordset,
      registros: registrosRes.recordset
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CLASIFICAR
// ══════════════════════════════════════════════════════════════════════════════

// POST /clasificar
// Body: { lote_id, categoria_clasif_id, sub_categoria_nombre?, destino?, kilos }
router.post('/clasificar', async (req, res) => {
  try {
    const { lote_id, categoria_clasif_id, sub_categoria_nombre, destino, kilos } = req.body;
    if (!lote_id || !categoria_clasif_id) {
      return res.status(400).json({ error: 'lote_id y categoria_clasif_id son obligatorios' });
    }
    const kilosNum = parseFloat(kilos);
    if (!kilosNum || kilosNum <= 0) {
      return res.status(400).json({ error: 'Kilos debe ser mayor a 0' });
    }
    // Validar destino si viene
    const destinoVal = destino && ['fresco', 'camara_fria'].includes(destino) ? destino : null;

    const pool = await getPool();
    const uid = req.user ? req.user.id : null;

    // 1. Obtener categoría
    const catRes = await pool.request()
      .input('cat_id', sql.Int, categoria_clasif_id)
      .query('SELECT id, nombre, codigo FROM CategoriasClasificacion WHERE id = @cat_id');
    if (!catRes.recordset.length) return res.status(404).json({ error: 'Categoría no encontrada' });
    const cat = catRes.recordset[0];

    // 2. Resolver sub-categoría: buscar por nombre o crear si es nueva
    let subCat = null;
    let sub_categoria_id = null;
    const subNombre = sub_categoria_nombre ? sub_categoria_nombre.trim() : '';
    if (subNombre) {
      // Buscar existente por nombre + categoría padre
      const existRes = await pool.request()
        .input('cat_id', sql.Int, categoria_clasif_id)
        .input('nombre', sql.NVarChar, subNombre)
        .query(`SELECT id, nombre, codigo FROM SubCategoriasClasificacion
                WHERE categoria_padre_id = @cat_id AND nombre = @nombre AND activo = 1`);

      if (existRes.recordset.length) {
        subCat = existRes.recordset[0];
        sub_categoria_id = subCat.id;
      } else {
        // Auto-crear: generar código a partir del nombre (primeras 3 letras uppercase)
        const codigo = subNombre.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ]/g, '').substring(0, 3).toUpperCase() || 'SUB';
        const insertRes = await pool.request()
          .input('cat_id', sql.Int, categoria_clasif_id)
          .input('nombre', sql.NVarChar, subNombre)
          .input('codigo', sql.NVarChar, codigo)
          .query(`INSERT INTO SubCategoriasClasificacion (categoria_padre_id, nombre, codigo)
                  OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.codigo
                  VALUES (@cat_id, @nombre, @codigo)`);
        subCat = insertRes.recordset[0];
        sub_categoria_id = subCat.id;
      }
    }

    // 3. Obtener lote padre
    const loteRes = await pool.request()
      .input('lote_id', sql.Int, lote_id)
      .query('SELECT id, codigo_interno, temporada_id, parcela_id, deposito_actual_id FROM LotesMercaderia WHERE id = @lote_id');
    if (!loteRes.recordset.length) return res.status(404).json({ error: 'Lote no encontrado' });
    const lote = loteRes.recordset[0];

    // 4. Validar que no supere kg despalillados
    const despRes = await pool.request()
      .input('lote_id', sql.Int, lote_id)
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total FROM Despalillado WHERE lote_id = @lote_id AND estado != 'anulada'`);
    const kilosDesp = parseFloat(despRes.recordset[0].total);

    const clasifRes = await pool.request()
      .input('lote_id', sql.Int, lote_id)
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total FROM Clasificacion WHERE lote_id = @lote_id AND estado != 'anulada'`);
    const kilosYaClasif = parseFloat(clasifRes.recordset[0].total);

    if (kilosYaClasif + kilosNum > kilosDesp + 0.01) {
      return res.status(400).json({
        error: `No se puede clasificar ${kilosNum} kg. Disponible: ${(kilosDesp - kilosYaClasif).toFixed(3)} kg`
      });
    }

    // 5. Construir código sub-lote: LOT-001.GR o LOT-001.GR-PIN
    let subLoteCodigo = lote.codigo_interno + '.' + cat.codigo;
    if (subCat) subLoteCodigo += '-' + subCat.codigo;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 6. Buscar sub-lote existente (mismo padre + misma categoría + misma sub-categoría)
      const subLoteReq = transaction.request()
        .input('lote_padre_id', sql.Int, lote_id)
        .input('cat_id', sql.Int, categoria_clasif_id);

      let subLoteQuery = `SELECT id, codigo_interno, kilos
              FROM LotesMercaderia
              WHERE lote_padre_id = @lote_padre_id
                AND categoria_clasif_id = @cat_id
                AND estado != 'anulada'`;

      if (sub_categoria_id) {
        subLoteReq.input('sub_id', sql.Int, sub_categoria_id);
        subLoteQuery += ' AND sub_categoria_id = @sub_id';
      } else {
        subLoteQuery += ' AND sub_categoria_id IS NULL';
      }

      const subRes = await subLoteReq.query(subLoteQuery);

      let subLoteId;

      if (subRes.recordset.length) {
        // Sub-lote existe: sumar kilos
        const existing = subRes.recordset[0];
        subLoteId = existing.id;
        const newKilos = parseFloat(existing.kilos) + kilosNum;

        const updateReq = transaction.request()
          .input('id', sql.Int, subLoteId)
          .input('kilos', sql.Decimal(10, 3), newKilos);
        let updateQuery = 'UPDATE LotesMercaderia SET kilos = @kilos';
        if (destinoVal) {
          updateReq.input('destino', sql.NVarChar, destinoVal);
          updateQuery += ', destino = @destino';
        }
        updateQuery += ' WHERE id = @id';
        await updateReq.query(updateQuery);
      } else {
        // Crear nuevo sub-lote
        const insertRes = await transaction.request()
          .input('codigo_interno', sql.NVarChar, subLoteCodigo)
          .input('lote_padre_id', sql.Int, lote_id)
          .input('categoria_clasif_id', sql.Int, categoria_clasif_id)
          .input('sub_categoria_id', sql.Int, sub_categoria_id || null)
          .input('temporada_id', sql.Int, lote.temporada_id)
          .input('parcela_id', sql.Int, lote.parcela_id)
          .input('kilos', sql.Decimal(10, 3), kilosNum)
          .input('destino', sql.NVarChar, destinoVal)
          .input('etapa', sql.NVarChar, 'clasificado')
          .input('estado', sql.NVarChar, 'abierto')
          .input('usuario_id', sql.Int, uid)
          .input('deposito_actual_id', sql.Int, lote.deposito_actual_id || null)
          .query(`INSERT INTO LotesMercaderia
                    (codigo_interno, lote_padre_id, categoria_clasif_id, sub_categoria_id,
                     temporada_id, parcela_id, kilos, destino, etapa, estado, fecha_inicio, usuario_id, deposito_actual_id)
                  OUTPUT INSERTED.id
                  VALUES (@codigo_interno, @lote_padre_id, @categoria_clasif_id, @sub_categoria_id,
                          @temporada_id, @parcela_id, @kilos, @destino, @etapa, @estado, GETDATE(), @usuario_id, @deposito_actual_id)`);
        subLoteId = insertRes.recordset[0].id;
      }

      // 7. Insertar registro de Clasificacion
      await transaction.request()
        .input('lote_id', sql.Int, lote_id)
        .input('sub_lote_id', sql.Int, subLoteId)
        .input('categoria_clasif_id', sql.Int, categoria_clasif_id)
        .input('sub_categoria_id', sql.Int, sub_categoria_id || null)
        .input('kilos', sql.Decimal(10, 3), kilosNum)
        .input('usuario_id', sql.Int, uid)
        .query(`INSERT INTO Clasificacion
                  (lote_id, sub_lote_id, categoria_clasif_id, sub_categoria_id, kilos, merma, usuario_id)
                VALUES (@lote_id, @sub_lote_id, @categoria_clasif_id, @sub_categoria_id, @kilos, 0, @usuario_id)`);

      // 8. Actualizar etapa del lote padre
      await transaction.request()
        .input('lote_id', sql.Int, lote_id)
        .query(`UPDATE LotesMercaderia SET etapa = 'en_clasificacion'
                WHERE id = @lote_id AND etapa NOT IN ('en_clasificacion', 'clasificado')`);

      await transaction.commit();
      res.json({ ok: true, sub_lote: { id: subLoteId, codigo_interno: subLoteCodigo } });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /finalizar-clasificacion/:lote_id — Marcar lote como completamente clasificado
router.post('/finalizar-clasificacion/:lote_id', async (req, res) => {
  try {
    const pool = await getPool();
    const loteId = parseInt(req.params.lote_id);

    // Verificar que hay clasificaciones
    const clasRes = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total FROM Clasificacion WHERE lote_id = @lote_id AND estado != 'anulada'`);
    const totalClasif = parseFloat(clasRes.recordset[0].total);

    if (totalClasif <= 0) {
      return res.status(400).json({ error: 'No hay clasificaciones registradas para este lote' });
    }

    await pool.request()
      .input('id', sql.Int, loteId)
      .query(`UPDATE LotesMercaderia SET etapa = 'clasificado' WHERE id = @id`);

    res.json({ ok: true, kilos_clasificados: totalClasif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SUB-LOTES CLASIFICADOS (disponibles para embalaje)
// ══════════════════════════════════════════════════════════════════════════════

// GET /clasificados — Sub-lotes con kilos disponibles para embalar
router.get('/clasificados', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT sl.id,
                     sl.codigo_interno,
                     sl.kilos                                           AS kilos_clasificados,
                     ISNULL(emb.kilos_embalados, 0)                    AS kilos_embalados,
                     sl.kilos - ISNULL(emb.kilos_embalados, 0)         AS kilos_disponible,
                     sl.lote_padre_id,
                     lp.codigo_interno                                 AS lote_padre_codigo,
                     sl.categoria_clasif_id,
                     cc.nombre                                         AS categoria,
                     cc.codigo                                         AS categoria_codigo,
                     cc.es_descarte,
                     sl.sub_categoria_id,
                     sc.nombre                                         AS sub_categoria,
                     sl.destino,
                     sl.temporada_id,
                     sl.parcela_id,
                     p.nombre                                          AS parcela
              FROM LotesMercaderia sl
              JOIN LotesMercaderia lp         ON sl.lote_padre_id        = lp.id
              JOIN CategoriasClasificacion cc  ON sl.categoria_clasif_id  = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id = sc.id
              LEFT JOIN Parcelas p             ON sl.parcela_id           = p.id
              LEFT JOIN (
                SELECT sub_lote_id, SUM(kilos) AS kilos_embalados
                FROM Embalaje WHERE estado != 'anulada'
                GROUP BY sub_lote_id
              ) emb ON emb.sub_lote_id = sl.id
              WHERE sl.lote_padre_id IS NOT NULL
                AND sl.etapa IN ('clasificado', 'embalado')
                AND sl.estado != 'anulada'
                AND (sl.kilos - ISNULL(emb.kilos_embalados, 0)) > 0
              ORDER BY sl.codigo_interno`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// EMBALAR
// ══════════════════════════════════════════════════════════════════════════════

// POST /embalar
// Body: { sub_lote_id, kilos, producto_id, cantidad_envases, deposito_id }
router.post('/embalar', async (req, res) => {
  try {
    const { sub_lote_id, kilos, producto_id, cantidad_envases, deposito_id } = req.body;
    if (!sub_lote_id || !kilos) return res.status(400).json({ error: 'sub_lote_id y kilos son obligatorios' });
    if (!deposito_id) return res.status(400).json({ error: 'Selecciona el depósito destino' });
    if (!producto_id) return res.status(400).json({ error: 'Selecciona el tipo de embalaje' });

    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    const kilosNum = parseFloat(kilos);
    const cantEnvases = parseInt(cantidad_envases) || 1;
    const now = new Date();

    // 1. Obtener sub-lote
    const slRes = await pool.request()
      .input('sub_lote_id', sql.Int, sub_lote_id)
      .query(`SELECT sl.id, sl.codigo_interno, sl.codigo_externo, sl.temporada_id,
                     sl.parcela_id, sl.kilos, sl.lote_padre_id,
                     lp.fecha_inicio AS fecha_cosecha
              FROM LotesMercaderia sl
              LEFT JOIN LotesMercaderia lp ON sl.lote_padre_id = lp.id
              WHERE sl.id = @sub_lote_id`);
    if (!slRes.recordset.length) return res.status(404).json({ error: 'Sub-lote no encontrado' });
    const subLote = slRes.recordset[0];

    // 2. Validar kilos disponibles
    const embRes = await pool.request()
      .input('sub_lote_id', sql.Int, sub_lote_id)
      .query(`SELECT ISNULL(SUM(kilos), 0) AS total FROM Embalaje WHERE sub_lote_id = @sub_lote_id AND estado != 'anulada'`);
    const yaEmbalado = parseFloat(embRes.recordset[0].total);
    const disponible = parseFloat(subLote.kilos) - yaEmbalado;

    if (kilosNum > disponible + 0.01) {
      return res.status(400).json({ error: `Solo hay ${disponible.toFixed(3)} kg disponibles para embalar` });
    }

    // 3. Obtener producto de embalaje y depósito
    const prodRes = await pool.request()
      .input('pid', sql.Int, producto_id)
      .query('SELECT id, nombre, stock_actual FROM Productos WHERE id = @pid');
    if (!prodRes.recordset.length) return res.status(404).json({ error: 'Producto de embalaje no encontrado' });
    const producto = prodRes.recordset[0];

    const depRes = await pool.request()
      .input('did', sql.Int, deposito_id)
      .query('SELECT id, nombre, tipo_deposito FROM Depositos WHERE id = @did');
    if (!depRes.recordset.length) return res.status(404).json({ error: 'Depósito no encontrado' });
    const deposito = depRes.recordset[0];
    const destino = deposito.tipo_deposito === 'camara_frio' ? 'camara_fria' : 'fresco';

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 4. Insertar registro de Embalaje
      await transaction.request()
        .input('sub_lote_id', sql.Int, sub_lote_id)
        .input('kilos', sql.Decimal(10, 3), kilosNum)
        .input('tipo_envase', sql.NVarChar, producto.nombre)
        .input('producto_id', sql.Int, producto_id)
        .input('cantidad_envases', sql.Int, cantEnvases)
        .input('destino', sql.NVarChar, destino)
        .input('deposito_id', sql.Int, deposito_id)
        .input('usuario_id', sql.Int, uid)
        .input('fecha_envasado', sql.DateTime, now)
        .query(`INSERT INTO Embalaje
                  (sub_lote_id, kilos, tipo_envase, producto_id, cantidad_envases, destino, deposito_id, usuario_id, fecha_envasado)
                VALUES (@sub_lote_id, @kilos, @tipo_envase, @producto_id, @cantidad_envases, @destino, @deposito_id, @usuario_id, @fecha_envasado)`);

      // 5. Actualizar sub-lote
      const sufijo = destino === 'fresco' ? '-F' : '-C';
      let codigoActualizado = subLote.codigo_interno;
      if (!codigoActualizado.endsWith('-F') && !codigoActualizado.endsWith('-C')) {
        codigoActualizado = codigoActualizado + sufijo;
      }

      await transaction.request()
        .input('id', sql.Int, sub_lote_id)
        .input('codigo_interno', sql.NVarChar, codigoActualizado)
        .input('destino', sql.NVarChar, destino)
        .input('deposito_id', sql.Int, deposito_id)
        .input('etapa', sql.NVarChar, 'embalado')
        .input('fecha_envasado', sql.DateTime, now)
        .query(`UPDATE LotesMercaderia
                SET codigo_interno = @codigo_interno,
                    destino        = @destino,
                    deposito_id    = @deposito_id,
                    deposito_actual_id = @deposito_id,
                    etapa          = @etapa,
                    fecha_envasado = @fecha_envasado
                WHERE id = @id`);

      // 6. Registrar movimiento de stock de mercadería en depósito
      const obs = `Embalaje lote ${codigoActualizado}`;

      await transaction.request()
        .input('deposito_id', sql.Int, deposito_id)
        .input('temporada_id', sql.Int, subLote.temporada_id)
        .input('parcela_id', sql.Int, subLote.parcela_id)
        .input('kilos', sql.Decimal(10, 3), kilosNum)
        .input('fecha', sql.DateTime, now)
        .input('observacion', sql.NVarChar, obs)
        .input('lote_id', sql.Int, sub_lote_id)
        .input('usuario_id', sql.Int, uid)
        .query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, lote_id, usuario_id)
                VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso', @kilos, @fecha, @observacion, @lote_id, @usuario_id)`);

      await transaction.request()
        .input('temporada_id', sql.Int, subLote.temporada_id)
        .input('parcela_id', sql.Int, subLote.parcela_id)
        .input('kilos', sql.Decimal(10, 3), kilosNum)
        .input('fecha', sql.DateTime, now)
        .input('observacion', sql.NVarChar, obs)
        .input('lote_id', sql.Int, sub_lote_id)
        .input('usuario_id', sql.Int, uid)
        .query(`INSERT INTO StockMercaderia
                  (temporada_id, parcela_id, tipo, kilos, destino, fecha, observacion, lote_id, usuario_id)
                VALUES (@temporada_id, @parcela_id, 'ingreso', @kilos, 'deposito', @fecha, @observacion, @lote_id, @usuario_id)`);

      // 7. Egreso de insumo (embalaje usado) — descontar stock
      const obsInsumo = `Embalaje lote ${codigoActualizado} — ${cantEnvases} x ${producto.nombre}`;

      await transaction.request()
        .input('producto_id', sql.Int, producto_id)
        .input('cantidad', sql.Decimal(10, 3), cantEnvases)
        .input('observacion', sql.NVarChar, obsInsumo)
        .input('usuario_id', sql.Int, uid)
        .input('deposito_id', sql.Int, deposito_id)
        .query(`INSERT INTO StockInsumos
                  (producto_id, tipo, cantidad, observacion, usuario_id, deposito_id, fecha_hora)
                VALUES (@producto_id, 'egreso', @cantidad, @observacion, @usuario_id, @deposito_id, GETDATE())`);

      await transaction.request()
        .input('producto_id', sql.Int, producto_id)
        .input('cantidad', sql.Decimal(10, 3), cantEnvases)
        .query('UPDATE Productos SET stock_actual = ISNULL(stock_actual, 0) - @cantidad WHERE id = @producto_id');

      // 8. Auto-generar codigo_externo (N° lote para etiqueta) si no existe
      let codigoExterno = subLote.codigo_externo;
      if (!codigoExterno) {
        const year = new Date().getFullYear();
        const corrRes = await transaction.request()
          .input('year', sql.Int, year)
          .query(`SELECT COUNT(*) AS total
                  FROM LotesMercaderia
                  WHERE codigo_externo IS NOT NULL
                    AND codigo_externo LIKE CAST(@year AS NVARCHAR) + '-%'`);
        const correlativo = (corrRes.recordset[0].total || 0) + 1;
        codigoExterno = year + '-' + String(correlativo).padStart(4, '0');

        await transaction.request()
          .input('id', sql.Int, sub_lote_id)
          .input('codigo_externo', sql.NVarChar, codigoExterno)
          .query('UPDATE LotesMercaderia SET codigo_externo = @codigo_externo WHERE id = @id');
      }

      await transaction.commit();
      res.json({
        ok: true,
        lote: {
          id: sub_lote_id,
          codigo_interno: codigoActualizado,
          codigo_externo: codigoExterno,
          fecha_envasado: now,
          fecha_cosecha: subLote.fecha_cosecha
        }
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// EMBALADOS HOY
// ══════════════════════════════════════════════════════════════════════════════

router.get('/embalados-hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT e.id,
                     e.sub_lote_id,
                     e.kilos,
                     e.tipo_envase,
                     e.cantidad_envases,
                     e.destino,
                     e.fecha_hora,
                     e.fecha_envasado,
                     e.estado,
                     lm.codigo_interno,
                     lm.codigo_externo,
                     cc.nombre     AS categoria,
                     sc.nombre     AS sub_categoria,
                     j.apellido + ', ' + j.nombre AS empleado,
                     dep.nombre    AS deposito,
                     u.nombre      AS usuario
              FROM Embalaje e
              JOIN LotesMercaderia lm              ON e.sub_lote_id          = lm.id
              LEFT JOIN CategoriasClasificacion cc  ON lm.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON lm.sub_categoria_id  = sc.id
              LEFT JOIN Juntadores j               ON e.empleado_id          = j.id
              LEFT JOIN Depositos dep              ON e.deposito_id          = dep.id
              LEFT JOIN Usuarios u                 ON e.usuario_id           = u.id
              WHERE CAST(e.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY e.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CLASIFICADOS HOY
// ══════════════════════════════════════════════════════════════════════════════

router.get('/clasificados-hoy', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT c.id,
                     c.kilos,
                     c.fecha_hora,
                     c.estado,
                     c.lote_id,
                     lp.codigo_interno   AS lote_codigo,
                     cc.nombre           AS categoria,
                     sc.nombre           AS sub_categoria,
                     u.nombre            AS usuario
              FROM Clasificacion c
              LEFT JOIN LotesMercaderia lp          ON c.lote_id              = lp.id
              LEFT JOIN CategoriasClasificacion cc   ON c.categoria_clasif_id  = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON c.sub_categoria_id    = sc.id
              LEFT JOIN Usuarios u                  ON c.usuario_id           = u.id
              WHERE CAST(c.fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
              ORDER BY c.fecha_hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ANULACIONES
// ══════════════════════════════════════════════════════════════════════════════

// POST /clasificacion/:id/anular
router.post('/clasificacion/:id/anular', async (req, res) => {
  try {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo es obligatorio' });

    const pool = await getPool();
    const id = parseInt(req.params.id);

    const cRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id, lote_id, sub_lote_id, kilos, estado FROM Clasificacion WHERE id = @id');
    if (!cRes.recordset.length) return res.status(404).json({ error: 'Clasificación no encontrada' });
    const clas = cRes.recordset[0];
    if (clas.estado === 'anulada') return res.status(400).json({ error: 'Ya se encuentra anulada' });

    const kilosNum = parseFloat(clas.kilos);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 1. Revertir kilos del sub-lote
      if (clas.sub_lote_id) {
        const slRes = await transaction.request()
          .input('sub_lote_id', sql.Int, clas.sub_lote_id)
          .query('SELECT id, kilos FROM LotesMercaderia WHERE id = @sub_lote_id');

        if (slRes.recordset.length) {
          const newKilos = Math.max(0, parseFloat(slRes.recordset[0].kilos) - kilosNum);
          if (newKilos <= 0) {
            await transaction.request()
              .input('id', sql.Int, clas.sub_lote_id)
              .query(`UPDATE LotesMercaderia SET kilos = 0, estado = 'anulada' WHERE id = @id`);
          } else {
            await transaction.request()
              .input('id', sql.Int, clas.sub_lote_id)
              .input('kilos', sql.Decimal(10, 3), newKilos)
              .query('UPDATE LotesMercaderia SET kilos = @kilos WHERE id = @id');
          }
        }
      }

      // 2. Marcar clasificación como anulada
      await transaction.request()
        .input('id', sql.Int, id)
        .query(`UPDATE Clasificacion SET estado = 'anulada' WHERE id = @id`);

      // 3. Registrar auditoría
      const uid = req.user ? req.user.id : null;
      const uNombre = req.user ? req.user.nombre : '';
      await transaction.request()
        .input('registro_id', sql.Int, id)
        .input('tabla_origen', sql.NVarChar, 'Clasificacion')
        .input('accion', sql.NVarChar, 'anulacion')
        .input('campo', sql.NVarChar, 'estado')
        .input('valor_anterior', sql.NVarChar, 'activa')
        .input('valor_nuevo', sql.NVarChar, 'anulada')
        .input('motivo', sql.NVarChar, motivo)
        .input('usuario_id', sql.Int, uid)
        .input('usuario_nombre', sql.NVarChar, uNombre)
        .query(`INSERT INTO AuditoriaClasificacion
                  (registro_id, tabla_origen, accion, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_nombre)
                VALUES (@registro_id, @tabla_origen, @accion, @campo, @valor_anterior, @valor_nuevo, @motivo, @usuario_id, @usuario_nombre)`);

      await transaction.commit();
      res.json({ ok: true });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /embalaje/:id/anular
router.post('/embalaje/:id/anular', async (req, res) => {
  try {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo es obligatorio' });

    const pool = await getPool();
    const id = parseInt(req.params.id);

    const eRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id, sub_lote_id, kilos, destino, deposito_id, producto_id, cantidad_envases, estado FROM Embalaje WHERE id = @id');
    if (!eRes.recordset.length) return res.status(404).json({ error: 'Embalaje no encontrado' });
    const emb = eRes.recordset[0];
    if (emb.estado === 'anulada') return res.status(400).json({ error: 'Ya se encuentra anulado' });

    const kilosNum = parseFloat(emb.kilos);
    const uid = req.user ? req.user.id : null;
    const now = new Date();

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // 1. Revertir movimientos de stock de mercadería
      if (emb.deposito_id) {
        const slRes = await transaction.request()
          .input('sub_lote_id', sql.Int, emb.sub_lote_id)
          .query('SELECT temporada_id, parcela_id FROM LotesMercaderia WHERE id = @sub_lote_id');
        const sl = slRes.recordset[0];
        const obs = `Anulación embalaje #${id}`;

        await transaction.request()
          .input('deposito_id', sql.Int, emb.deposito_id)
          .input('temporada_id', sql.Int, sl.temporada_id)
          .input('parcela_id', sql.Int, sl.parcela_id)
          .input('kilos', sql.Decimal(10, 3), kilosNum)
          .input('fecha', sql.DateTime, now)
          .input('observacion', sql.NVarChar, obs)
          .input('lote_id', sql.Int, emb.sub_lote_id)
          .input('usuario_id', sql.Int, uid)
          .query(`INSERT INTO MovimientosDeposito
                    (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, lote_id, usuario_id)
                  VALUES (@deposito_id, @temporada_id, @parcela_id, 'egreso_anulacion', @kilos, @fecha, @observacion, @lote_id, @usuario_id)`);

        await transaction.request()
          .input('temporada_id', sql.Int, sl.temporada_id)
          .input('parcela_id', sql.Int, sl.parcela_id)
          .input('kilos', sql.Decimal(10, 3), kilosNum)
          .input('fecha', sql.DateTime, now)
          .input('observacion', sql.NVarChar, obs)
          .input('lote_id', sql.Int, emb.sub_lote_id)
          .input('usuario_id', sql.Int, uid)
          .query(`INSERT INTO StockMercaderia
                    (temporada_id, parcela_id, tipo, kilos, destino, fecha, observacion, lote_id, usuario_id)
                  VALUES (@temporada_id, @parcela_id, 'egreso_anulacion', @kilos, 'deposito', @fecha, @observacion, @lote_id, @usuario_id)`);
      }

      // 1b. Revertir egreso de insumo (devolver embalajes al stock)
      if (emb.producto_id && emb.cantidad_envases) {
        const obsInsumo = `Anulación embalaje #${id} — devuelve ${emb.cantidad_envases} unidades`;

        await transaction.request()
          .input('producto_id', sql.Int, emb.producto_id)
          .input('cantidad', sql.Decimal(10, 3), emb.cantidad_envases)
          .input('observacion', sql.NVarChar, obsInsumo)
          .input('usuario_id', sql.Int, uid)
          .query(`INSERT INTO StockInsumos
                    (producto_id, tipo, cantidad, observacion, usuario_id, fecha_hora)
                  VALUES (@producto_id, 'ingreso_manual', @cantidad, @observacion, @usuario_id, GETDATE())`);

        await transaction.request()
          .input('producto_id', sql.Int, emb.producto_id)
          .input('cantidad', sql.Decimal(10, 3), emb.cantidad_envases)
          .query('UPDATE Productos SET stock_actual = ISNULL(stock_actual, 0) + @cantidad WHERE id = @producto_id');
      }

      // 2. Revertir código del sub-lote
      const slCodeRes = await transaction.request()
        .input('sub_lote_id', sql.Int, emb.sub_lote_id)
        .query('SELECT codigo_interno FROM LotesMercaderia WHERE id = @sub_lote_id');
      if (slCodeRes.recordset.length) {
        let codigo = slCodeRes.recordset[0].codigo_interno;
        if (codigo.endsWith('-F') || codigo.endsWith('-C')) {
          codigo = codigo.slice(0, -2);
          await transaction.request()
            .input('id', sql.Int, emb.sub_lote_id)
            .input('codigo_interno', sql.NVarChar, codigo)
            .query(`UPDATE LotesMercaderia
                    SET codigo_interno = @codigo_interno,
                        etapa = 'clasificado',
                        destino = NULL,
                        deposito_id = NULL,
                        fecha_envasado = NULL
                    WHERE id = @id`);
        }
      }

      // 3. Marcar embalaje como anulado
      await transaction.request()
        .input('id', sql.Int, id)
        .query(`UPDATE Embalaje SET estado = 'anulada' WHERE id = @id`);

      // 4. Registrar auditoría
      const uNombre = req.user ? req.user.nombre : '';
      await transaction.request()
        .input('registro_id', sql.Int, id)
        .input('tabla_origen', sql.NVarChar, 'Embalaje')
        .input('accion', sql.NVarChar, 'anulacion')
        .input('campo', sql.NVarChar, 'estado')
        .input('valor_anterior', sql.NVarChar, 'activa')
        .input('valor_nuevo', sql.NVarChar, 'anulada')
        .input('motivo', sql.NVarChar, motivo)
        .input('usuario_id', sql.Int, uid)
        .input('usuario_nombre', sql.NVarChar, uNombre)
        .query(`INSERT INTO AuditoriaClasificacion
                  (registro_id, tabla_origen, accion, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_nombre)
                VALUES (@registro_id, @tabla_origen, @accion, @campo, @valor_anterior, @valor_nuevo, @motivo, @usuario_id, @usuario_nombre)`);

      await transaction.commit();
      res.json({ ok: true });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RESUMEN / KPIs
// ══════════════════════════════════════════════════════════════════════════════

router.get('/resumen', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT
                (SELECT COUNT(*)
                 FROM LotesMercaderia l
                 LEFT JOIN (SELECT lote_id, SUM(kilos) AS t FROM Despalillado WHERE estado != 'anulada' GROUP BY lote_id) d ON d.lote_id = l.id
                 LEFT JOIN (SELECT lote_id, SUM(kilos) AS t FROM Clasificacion WHERE estado != 'anulada' GROUP BY lote_id) c ON c.lote_id = l.id
                 WHERE l.estado = 'despalillado' AND l.lote_padre_id IS NULL
                   AND ISNULL(d.t, 0) > ISNULL(c.t, 0)
                ) AS pendientes_clasificacion,
                ISNULL((SELECT SUM(kilos) FROM Clasificacion WHERE CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE) AND estado != 'anulada'), 0) AS clasificados_hoy_kg,
                ISNULL((SELECT COUNT(*) FROM Clasificacion WHERE CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE) AND estado != 'anulada'), 0) AS clasificados_hoy_cant,
                ISNULL((SELECT SUM(kilos) FROM Embalaje WHERE CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE) AND estado != 'anulada'), 0) AS embalados_hoy_kg,
                ISNULL((SELECT COUNT(*) FROM Embalaje WHERE CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE) AND estado != 'anulada'), 0) AS embalados_hoy_cant,
                ISNULL((SELECT COUNT(DISTINCT sub_lote_id) FROM Embalaje WHERE CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE) AND estado != 'anulada'), 0) AS lotes_generados_hoy
             `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INFO ETIQUETA
// ══════════════════════════════════════════════════════════════════════════════

// GET /etiqueta/:sub_lote_id — Datos para generar la etiqueta de un sub-lote embalado
router.get('/etiqueta/:sub_lote_id', async (req, res) => {
  try {
    const pool = await getPool();
    const subLoteId = parseInt(req.params.sub_lote_id);

    const result = await pool.request()
      .input('id', sql.Int, subLoteId)
      .query(`SELECT sl.id,
                     sl.codigo_interno,
                     sl.codigo_externo      AS numero_lote,
                     sl.kilos,
                     sl.destino,
                     sl.fecha_envasado,
                     cc.nombre              AS categoria,
                     cc.codigo              AS categoria_codigo,
                     sc.nombre              AS sub_categoria,
                     lp.codigo_interno      AS lote_padre_codigo,
                     lp.fecha_inicio        AS fecha_elaboracion,
                     p.nombre               AS parcela,
                     e.tipo_envase,
                     e.cantidad_envases
              FROM LotesMercaderia sl
              LEFT JOIN LotesMercaderia lp           ON sl.lote_padre_id        = lp.id
              LEFT JOIN CategoriasClasificacion cc    ON sl.categoria_clasif_id  = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id     = sc.id
              LEFT JOIN Parcelas p                   ON sl.parcela_id           = p.id
              LEFT JOIN (
                SELECT sub_lote_id, tipo_envase, cantidad_envases,
                       ROW_NUMBER() OVER (PARTITION BY sub_lote_id ORDER BY fecha_hora DESC) AS rn
                FROM Embalaje WHERE estado != 'anulada'
              ) e ON e.sub_lote_id = sl.id AND e.rn = 1
              WHERE sl.id = @id`);

    if (!result.recordset.length) return res.status(404).json({ error: 'Sub-lote no encontrado' });

    const data = result.recordset[0];

    // Datos de empresa para etiqueta
    const empresaRes = await pool.request()
      .query('SELECT TOP 1 razon_social, cuit, rne, rnpa, renspa, direccion, localidad, provincia FROM ConfiguracionEmpresa');
    const empresa = empresaRes.recordset[0] || {};

    // Calcular fecha de vencimiento (elaboración + 2 años)
    let fechaVencimiento = null;
    if (data.fecha_elaboracion) {
      const fv = new Date(data.fecha_elaboracion);
      fv.setFullYear(fv.getFullYear() + 2);
      fechaVencimiento = fv;
    }

    // Construir nombre producto para etiqueta: FRUTILLA "GRANDE" PINTONA
    let nombreProducto = 'FRUTILLA';
    if (data.categoria) nombreProducto += ` "${data.categoria.toUpperCase()}"`;
    if (data.sub_categoria) nombreProducto += ` ${data.sub_categoria.toUpperCase()}`;

    res.json({
      ...data,
      nombre_producto: nombreProducto,
      fecha_vencimiento: fechaVencimiento,
      empresa
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
