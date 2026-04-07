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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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

    // Embalajes del lote (a través de sub-lotes)
    const embalajesRes = await pool.request()
      .input('lote_id2', sql.Int, loteId)
      .query(`SELECT e.id, e.sub_lote_id, e.kilos, e.tipo_envase, e.cantidad_envases,
                     e.destino, e.fecha_hora, e.estado, e.producto_id, e.deposito_id,
                     lm.codigo_interno, lm.codigo_externo,
                     cc.nombre AS categoria, sc.nombre AS sub_categoria,
                     dep.nombre AS deposito,
                     p.nombre AS insumo,
                     u.nombre AS usuario
              FROM Embalaje e
              JOIN LotesMercaderia lm ON e.sub_lote_id = lm.id
              LEFT JOIN CategoriasClasificacion cc ON lm.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON lm.sub_categoria_id = sc.id
              LEFT JOIN Depositos dep ON e.deposito_id = dep.id
              LEFT JOIN Productos p ON e.producto_id = p.id
              LEFT JOIN Usuarios u ON e.usuario_id = u.id
              WHERE lm.lote_padre_id = @lote_id2
              ORDER BY e.fecha_hora DESC`);

    // Sub-lotes generados
    const subLotesRes = await pool.request()
      .input('lote_id3', sql.Int, loteId)
      .query(`SELECT sl.id, sl.codigo_interno, sl.kilos, sl.etapa,
                     cc.nombre AS categoria, sc.nombre AS sub_categoria
              FROM LotesMercaderia sl
              LEFT JOIN CategoriasClasificacion cc ON sl.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id = sc.id
              WHERE sl.lote_padre_id = @lote_id3
              ORDER BY cc.nombre, sc.nombre`);

    res.json({
      lote: loteRes.recordset[0],
      resumen_categorias: clasifRes.recordset,
      registros: registrosRes.recordset,
      embalajes: embalajesRes.recordset,
      sub_lotes: subLotesRes.recordset
    });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /finalizar-embalaje/:lote_id — Marcar lote como completamente embalado (cerrar lote)
router.post('/finalizar-embalaje/:lote_id', async (req, res) => {
  try {
    const pool = await getPool();
    const loteId = parseInt(req.params.lote_id);

    // Verificar que el lote existe y está en etapa clasificado
    const loteRes = await pool.request()
      .input('id', sql.Int, loteId)
      .query(`SELECT id, etapa, codigo_interno FROM LotesMercaderia WHERE id = @id`);
    if (!loteRes.recordset.length) return res.status(404).json({ error: 'Lote no encontrado' });
    const lote = loteRes.recordset[0];
    if (lote.etapa !== 'clasificado') return res.status(400).json({ error: 'El lote no está en etapa clasificado' });

    // Verificar que hay embalajes registrados
    const embRes = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .query(`SELECT ISNULL(SUM(e.kilos), 0) AS total
              FROM Embalaje e
              JOIN LotesMercaderia sl ON e.sub_lote_id = sl.id
              WHERE sl.lote_padre_id = @lote_id AND e.estado != 'anulada'`);
    const totalEmb = parseFloat(embRes.recordset[0].total);
    if (totalEmb <= 0) return res.status(400).json({ error: 'No hay embalajes registrados para este lote' });

    // Verificar que no quedan sub-lotes con kilos disponibles
    const dispRes = await pool.request()
      .input('lote_id', sql.Int, loteId)
      .query(`SELECT sl.id, sl.kilos - ISNULL(emb.kilos_embalados, 0) AS kilos_disponible
              FROM LotesMercaderia sl
              LEFT JOIN (
                SELECT sub_lote_id, SUM(kilos) AS kilos_embalados
                FROM Embalaje WHERE estado != 'anulada' GROUP BY sub_lote_id
              ) emb ON sl.id = emb.sub_lote_id
              WHERE sl.lote_padre_id = @lote_id
                AND sl.etapa IN ('clasificado', 'embalado', 'vendido_parcial')
                AND (sl.kilos - ISNULL(emb.kilos_embalados, 0)) > 0.01`);
    if (dispRes.recordset.length > 0) {
      return res.status(400).json({ error: 'Aún hay sub-lotes con kilos disponibles para embalar' });
    }

    // Actualizar etapa del lote padre a 'embalado'
    await pool.request()
      .input('id', sql.Int, loteId)
      .query(`UPDATE LotesMercaderia SET etapa = 'embalado' WHERE id = @id`);

    // Actualizar sub-lotes clasificados a 'embalado' (los que no tengan ventas parciales)
    await pool.request()
      .input('lote_id', sql.Int, loteId)
      .query(`UPDATE LotesMercaderia SET etapa = 'embalado'
              WHERE lote_padre_id = @lote_id AND etapa = 'clasificado'`);

    res.json({ ok: true, kilos_embalados: totalEmb });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
                AND sl.etapa IN ('clasificado', 'embalado', 'vendido_parcial')
                AND sl.estado != 'anulada'
                AND (sl.kilos - ISNULL(emb.kilos_embalados, 0)) > 0
              ORDER BY sl.codigo_interno`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// EMBALAR
// ══════════════════════════════════════════════════════════════════════════════

// POST /embalar
// Body: { sub_lote_id, kilos, producto_id, cantidad_envases, deposito_id, tipo_embalaje_id? }
router.post('/embalar', async (req, res) => {
  try {
    const { sub_lote_id, kilos, producto_id, cantidad_envases, deposito_id, tipo_embalaje_id } = req.body;

    if (!sub_lote_id) return res.status(400).json({ error: 'sub_lote_id es obligatorio' });
    if (!kilos || parseFloat(kilos) <= 0) return res.status(400).json({ error: 'Ingresá los kilos embalados' });
    if (!deposito_id) return res.status(400).json({ error: 'Selecciona el depósito destino' });
    if (!producto_id) return res.status(400).json({ error: 'Selecciona el insumo de embalaje' });

    const pool = await getPool();
    const uid = req.user ? req.user.id : null;
    let tipoEmbalajeId = tipo_embalaje_id ? parseInt(tipo_embalaje_id) : null;

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

    // Auto-resolver tipo_embalaje_id si no fue enviado
    if (!tipoEmbalajeId && producto.nombre) {
      const pesoMatch = producto.nombre.match(/(\d+(?:\.?\d+)?)\s*kg/i);
      if (pesoMatch) {
        const teRes = await pool.request()
          .input('peso_pattern', sql.NVarChar, '%' + pesoMatch[1] + 'kg%')
          .query('SELECT TOP 1 id FROM TiposEmbalaje WHERE activo = 1 AND LOWER(nombre) LIKE @peso_pattern');
        if (teRes.recordset.length) tipoEmbalajeId = teRes.recordset[0].id;
      }
    }

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
      const insertEmbReq = transaction.request()
        .input('sub_lote_id', sql.Int, sub_lote_id)
        .input('kilos', sql.Decimal(10, 3), kilosNum)
        .input('tipo_envase', sql.NVarChar, producto.nombre)
        .input('producto_id', sql.Int, producto_id)
        .input('cantidad_envases', sql.Int, cantEnvases)
        .input('destino', sql.NVarChar, destino)
        .input('deposito_id', sql.Int, deposito_id)
        .input('usuario_id', sql.Int, uid)
        .input('fecha_envasado', sql.DateTime, now);

      if (tipoEmbalajeId) {
        insertEmbReq.input('tipo_embalaje_id', sql.Int, tipoEmbalajeId);
        await insertEmbReq.query(`INSERT INTO Embalaje
                  (sub_lote_id, kilos, tipo_envase, producto_id, cantidad_envases, destino, deposito_id, usuario_id, fecha_envasado, tipo_embalaje_id)
                VALUES (@sub_lote_id, @kilos, @tipo_envase, @producto_id, @cantidad_envases, @destino, @deposito_id, @usuario_id, @fecha_envasado, @tipo_embalaje_id)`);
      } else {
        await insertEmbReq.query(`INSERT INTO Embalaje
                  (sub_lote_id, kilos, tipo_envase, producto_id, cantidad_envases, destino, deposito_id, usuario_id, fecha_envasado)
                VALUES (@sub_lote_id, @kilos, @tipo_envase, @producto_id, @cantidad_envases, @destino, @deposito_id, @usuario_id, @fecha_envasado)`);
      }

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

      const movReq = transaction.request()
        .input('deposito_id', sql.Int, deposito_id)
        .input('temporada_id', sql.Int, subLote.temporada_id)
        .input('parcela_id', sql.Int, subLote.parcela_id)
        .input('kilos', sql.Decimal(10, 3), kilosNum)
        .input('fecha', sql.DateTime, now)
        .input('observacion', sql.NVarChar, obs)
        .input('lote_id', sql.Int, subLote.lote_padre_id || null)
        .input('sub_lote_id', sql.Int, sub_lote_id)
        .input('cantidad_envases', sql.Int, cantEnvases)
        .input('usuario_id', sql.Int, uid);
      if (tipoEmbalajeId) movReq.input('tipo_embalaje_id', sql.Int, tipoEmbalajeId);
      await movReq.query(`INSERT INTO MovimientosDeposito
                  (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, lote_id, sub_lote_id, cantidad_envases, tipo_embalaje_id, usuario_id)
                VALUES (@deposito_id, @temporada_id, @parcela_id, 'ingreso_embalaje', @kilos, @fecha, @observacion, @lote_id, @sub_lote_id, @cantidad_envases, ${tipoEmbalajeId ? '@tipo_embalaje_id' : 'NULL'}, @usuario_id)`);

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

      // 7b. Verificar stock resultante para warning
      const stockCheckRes = await transaction.request()
        .input('producto_id', sql.Int, producto_id)
        .query('SELECT stock_actual FROM Productos WHERE id = @producto_id');
      const stockResultante = parseFloat(stockCheckRes.recordset[0].stock_actual);
      let warningMsg = null;
      if (stockResultante < 0) {
        warningMsg = `Stock de insumo ${producto.nombre} en negativo (${stockResultante} unidades). Regularizar ingreso.`;
      }

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
      const response = {
        ok: true,
        lote: {
          id: sub_lote_id,
          codigo_interno: codigoActualizado,
          codigo_externo: codigoExterno,
          fecha_envasado: now,
          fecha_cosecha: subLote.fecha_cosecha
        }
      };
      if (warningMsg) response.warning = warningMsg;
      res.json(response);
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// EDICIONES
// ══════════════════════════════════════════════════════════════════════════════

// PUT /clasificacion/:id — Editar registro de clasificación
router.put('/clasificacion/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id = parseInt(req.params.id);
    const { categoria_clasif_id, sub_categoria_nombre, kilos, motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo de edición es obligatorio' });

    const cRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT c.id, c.kilos, c.categoria_clasif_id, c.sub_categoria_id, c.lote_id, c.sub_lote_id, c.estado,
                     cc.nombre AS categoria, sc.nombre AS sub_categoria
              FROM Clasificacion c
              LEFT JOIN CategoriasClasificacion cc ON c.categoria_clasif_id = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON c.sub_categoria_id = sc.id
              WHERE c.id = @id`);
    if (!cRes.recordset.length) return res.status(404).json({ error: 'Clasificación no encontrada' });
    const prev = cRes.recordset[0];
    if (prev.estado === 'anulada') return res.status(400).json({ error: 'No se puede editar un registro anulado' });

    const uid = req.user ? req.user.id : null;
    const uNombre = req.user ? req.user.nombre : '';
    const newKilos = kilos !== undefined ? parseFloat(kilos) : parseFloat(prev.kilos);
    const newCatId = categoria_clasif_id ? parseInt(categoria_clasif_id) : prev.categoria_clasif_id;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Resolver sub_categoria_id si viene nombre
      let newSubCatId = prev.sub_categoria_id;
      if (sub_categoria_nombre !== undefined) {
        if (sub_categoria_nombre) {
          const scRes = await transaction.request()
            .input('cat_id', sql.Int, newCatId)
            .input('nombre', sql.NVarChar, sub_categoria_nombre.trim())
            .query(`SELECT id FROM SubCategoriasClasificacion WHERE categoria_clasif_id = @cat_id AND nombre = @nombre`);
          if (scRes.recordset.length) {
            newSubCatId = scRes.recordset[0].id;
          } else {
            const insRes = await transaction.request()
              .input('cat_id', sql.Int, newCatId)
              .input('nombre', sql.NVarChar, sub_categoria_nombre.trim())
              .query(`INSERT INTO SubCategoriasClasificacion (categoria_clasif_id, nombre) OUTPUT INSERTED.id VALUES (@cat_id, @nombre)`);
            newSubCatId = insRes.recordset[0].id;
          }
        } else {
          newSubCatId = null;
        }
      }

      // Ajustar kilos en sub-lote si cambió
      const diffKilos = newKilos - parseFloat(prev.kilos);
      if (Math.abs(diffKilos) > 0.001 && prev.sub_lote_id) {
        await transaction.request()
          .input('sub_lote_id', sql.Int, prev.sub_lote_id)
          .input('diff', sql.Decimal(10,3), diffKilos)
          .query('UPDATE LotesMercaderia SET kilos = kilos + @diff WHERE id = @sub_lote_id');
      }

      // Update clasificación
      await transaction.request()
        .input('id', sql.Int, id)
        .input('cat_id', sql.Int, newCatId)
        .input('sub_cat_id', sql.Int, newSubCatId)
        .input('kilos', sql.Decimal(10,3), newKilos)
        .query('UPDATE Clasificacion SET categoria_clasif_id = @cat_id, sub_categoria_id = @sub_cat_id, kilos = @kilos WHERE id = @id');

      // Obtener nombres nuevos para auditoría
      const newNames = await transaction.request()
        .input('cat_id', sql.Int, newCatId)
        .input('sub_cat_id', sql.Int, newSubCatId)
        .query(`SELECT cc.nombre AS cat, sc.nombre AS sub FROM CategoriasClasificacion cc
                LEFT JOIN SubCategoriasClasificacion sc ON sc.id = @sub_cat_id WHERE cc.id = @cat_id`);
      const nn = newNames.recordset[0] || {};

      // Auditoría
      const valorAnterior = (prev.categoria || '') + '|' + (prev.sub_categoria || '') + '|' + prev.kilos;
      const valorNuevo = (nn.cat || '') + '|' + (nn.sub || '') + '|' + newKilos;
      await transaction.request()
        .input('registro_id', sql.Int, id)
        .input('tabla_origen', sql.NVarChar, 'Clasificacion')
        .input('accion', sql.NVarChar, 'edicion')
        .input('campo', sql.NVarChar, 'categoria|sub_categoria|kilos')
        .input('valor_anterior', sql.NVarChar, valorAnterior)
        .input('valor_nuevo', sql.NVarChar, valorNuevo)
        .input('motivo', sql.NVarChar, motivo)
        .input('usuario_id', sql.Int, uid)
        .input('usuario_nombre', sql.NVarChar, uNombre)
        .query(`INSERT INTO AuditoriaClasificacion
                  (registro_id, tabla_origen, accion, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_nombre)
                VALUES (@registro_id, @tabla_origen, @accion, @campo, @valor_anterior, @valor_nuevo, @motivo, @usuario_id, @usuario_nombre)`);

      await transaction.commit();
      res.json({ ok: true });
    } catch (innerErr) { await transaction.rollback(); throw innerErr; }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /embalaje/:id — Editar registro de embalaje
router.put('/embalaje/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const id = parseInt(req.params.id);
    const { producto_id, cantidad_envases, kilos, deposito_id, motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo de edición es obligatorio' });

    const eRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT e.id, e.kilos, e.producto_id, e.cantidad_envases, e.deposito_id, e.sub_lote_id, e.estado,
                     p.nombre AS insumo, dep.nombre AS deposito
              FROM Embalaje e
              LEFT JOIN Productos p ON e.producto_id = p.id
              LEFT JOIN Depositos dep ON e.deposito_id = dep.id
              WHERE e.id = @id`);
    if (!eRes.recordset.length) return res.status(404).json({ error: 'Embalaje no encontrado' });
    const prev = eRes.recordset[0];
    if (prev.estado === 'anulada') return res.status(400).json({ error: 'No se puede editar un registro anulado' });

    const uid = req.user ? req.user.id : null;
    const uNombre = req.user ? req.user.nombre : '';
    const newKilos = kilos !== undefined ? parseFloat(kilos) : parseFloat(prev.kilos);
    const newProductoId = producto_id ? parseInt(producto_id) : prev.producto_id;
    const newCantEnvases = cantidad_envases ? parseInt(cantidad_envases) : prev.cantidad_envases;
    const newDepositoId = deposito_id ? parseInt(deposito_id) : prev.deposito_id;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Ajustar stock insumo si cambió producto o cantidad
      const prevCant = prev.cantidad_envases || 1;
      if (newProductoId !== prev.producto_id || newCantEnvases !== prevCant) {
        // Devolver stock anterior
        await transaction.request()
          .input('pid', sql.Int, prev.producto_id)
          .input('cant', sql.Int, prevCant)
          .query('UPDATE Productos SET stock_actual = stock_actual + @cant WHERE id = @pid');
        // Descontar nuevo stock
        await transaction.request()
          .input('pid', sql.Int, newProductoId)
          .input('cant', sql.Int, newCantEnvases)
          .query('UPDATE Productos SET stock_actual = stock_actual - @cant WHERE id = @pid');
      }

      // Ajustar kilos en MovimientosDeposito y StockMercaderia si cambió
      const diffKilos = newKilos - parseFloat(prev.kilos);
      if (Math.abs(diffKilos) > 0.001) {
        // Actualizar sub-lote kilos
        if (prev.sub_lote_id) {
          await transaction.request()
            .input('slid', sql.Int, prev.sub_lote_id)
            .input('diff', sql.Decimal(10,3), diffKilos)
            .query('UPDATE LotesMercaderia SET kilos = kilos + @diff WHERE id = @slid');
        }
      }

      // Obtener nombre nuevo del producto
      const prodRes = await transaction.request()
        .input('pid', sql.Int, newProductoId)
        .query('SELECT nombre FROM Productos WHERE id = @pid');
      const newInsumo = prodRes.recordset.length ? prodRes.recordset[0].nombre : '';

      const depRes = await transaction.request()
        .input('did', sql.Int, newDepositoId)
        .query('SELECT nombre FROM Depositos WHERE id = @did');
      const newDeposito = depRes.recordset.length ? depRes.recordset[0].nombre : '';

      // Update embalaje
      await transaction.request()
        .input('id', sql.Int, id)
        .input('producto_id', sql.Int, newProductoId)
        .input('cantidad_envases', sql.Int, newCantEnvases)
        .input('kilos', sql.Decimal(10,3), newKilos)
        .input('deposito_id', sql.Int, newDepositoId)
        .input('tipo_envase', sql.NVarChar, newInsumo)
        .query('UPDATE Embalaje SET producto_id = @producto_id, cantidad_envases = @cantidad_envases, kilos = @kilos, deposito_id = @deposito_id, tipo_envase = @tipo_envase WHERE id = @id');

      // Auditoría
      const valorAnterior = (prev.insumo || '') + '|' + prevCant + '|' + prev.kilos + '|' + (prev.deposito || '');
      const valorNuevo = newInsumo + '|' + newCantEnvases + '|' + newKilos + '|' + newDeposito;
      await transaction.request()
        .input('registro_id', sql.Int, id)
        .input('tabla_origen', sql.NVarChar, 'Embalaje')
        .input('accion', sql.NVarChar, 'edicion')
        .input('campo', sql.NVarChar, 'insumo|envases|kilos|deposito')
        .input('valor_anterior', sql.NVarChar, valorAnterior)
        .input('valor_nuevo', sql.NVarChar, valorNuevo)
        .input('motivo', sql.NVarChar, motivo)
        .input('usuario_id', sql.Int, uid)
        .input('usuario_nombre', sql.NVarChar, uNombre)
        .query(`INSERT INTO AuditoriaClasificacion
                  (registro_id, tabla_origen, accion, campo, valor_anterior, valor_nuevo, motivo, usuario_id, usuario_nombre)
                VALUES (@registro_id, @tabla_origen, @accion, @campo, @valor_anterior, @valor_nuevo, @motivo, @usuario_id, @usuario_nombre)`);

      await transaction.commit();
      res.json({ ok: true });
    } catch (innerErr) { await transaction.rollback(); throw innerErr; }
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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

        // Obtener lote_padre_id del sub-lote
        const slParentRes = await transaction.request()
          .input('sl_id', sql.Int, emb.sub_lote_id)
          .query('SELECT lote_padre_id FROM LotesMercaderia WHERE id = @sl_id');
        const lotePadreId = slParentRes.recordset[0]?.lote_padre_id || null;

        await transaction.request()
          .input('deposito_id', sql.Int, emb.deposito_id)
          .input('temporada_id', sql.Int, sl.temporada_id)
          .input('parcela_id', sql.Int, sl.parcela_id)
          .input('kilos', sql.Decimal(10, 3), kilosNum)
          .input('fecha', sql.DateTime, now)
          .input('observacion', sql.NVarChar, obs)
          .input('lote_id', sql.Int, lotePadreId)
          .input('sub_lote_id', sql.Int, emb.sub_lote_id)
          .input('usuario_id', sql.Int, uid)
          .query(`INSERT INTO MovimientosDeposito
                    (deposito_id, temporada_id, parcela_id, tipo, kilos, fecha, observacion, lote_id, sub_lote_id, usuario_id)
                  VALUES (@deposito_id, @temporada_id, @parcela_id, 'egreso_anulacion', @kilos, @fecha, @observacion, @lote_id, @sub_lote_id, @usuario_id)`);
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
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
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS DE EMBALAJE
// ══════════════════════════════════════════════════════════════════════════════

router.get('/tipos-embalaje', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, nombre, peso_kg FROM TiposEmbalaje WHERE activo = 1 ORDER BY nombre');
    res.json(result.recordset);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ETIQUETA TÉRMICA (HTML para impresora)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/etiqueta/:sub_lote_id/print', async (req, res) => {
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
                     e.cantidad_envases,
                     te.nombre              AS tipo_embalaje_nombre,
                     te.peso_kg             AS peso_unitario
              FROM LotesMercaderia sl
              LEFT JOIN LotesMercaderia lp           ON sl.lote_padre_id        = lp.id
              LEFT JOIN CategoriasClasificacion cc    ON sl.categoria_clasif_id  = cc.id
              LEFT JOIN SubCategoriasClasificacion sc ON sl.sub_categoria_id     = sc.id
              LEFT JOIN Parcelas p                   ON sl.parcela_id           = p.id
              LEFT JOIN (
                SELECT sub_lote_id, tipo_envase, cantidad_envases, tipo_embalaje_id,
                       ROW_NUMBER() OVER (PARTITION BY sub_lote_id ORDER BY fecha_hora DESC) AS rn
                FROM Embalaje WHERE estado != 'anulada'
              ) e ON e.sub_lote_id = sl.id AND e.rn = 1
              LEFT JOIN TiposEmbalaje te ON e.tipo_embalaje_id = te.id
              WHERE sl.id = @id`);

    if (!result.recordset.length) return res.status(404).json({ error: 'Sub-lote no encontrado' });
    const data = result.recordset[0];

    const empresaRes = await pool.request()
      .query('SELECT TOP 1 razon_social, cuit, rne, rnpa, renspa, direccion, localidad, provincia FROM ConfiguracionEmpresa');
    const emp = empresaRes.recordset[0] || {};

    let nombreProducto = 'FRUTILLA';
    if (data.categoria) nombreProducto += ` "${data.categoria.toUpperCase()}"`;
    if (data.sub_categoria) nombreProducto += ` ${data.sub_categoria.toUpperCase()}`;

    const numLote = data.numero_lote || data.codigo_interno || '—';
    const fechaElab = data.fecha_elaboracion ? new Date(data.fecha_elaboracion).toLocaleDateString('es-AR') : '—';
    const fechaEnv = data.fecha_envasado ? new Date(data.fecha_envasado).toLocaleDateString('es-AR') : '—';
    let fechaVenc = '—';
    if (data.fecha_elaboracion) {
      const fv = new Date(data.fecha_elaboracion);
      fv.setFullYear(fv.getFullYear() + 2);
      fechaVenc = fv.toLocaleDateString('es-AR');
    }

    const pesoNeto = parseFloat(data.kilos) || 0;
    const tipoEnvase = data.tipo_embalaje_nombre || data.tipo_envase || '—';
    const razonSocial = emp.razon_social || 'CONFIGURAR EMPRESA';
    const direccion = [emp.direccion, emp.localidad, emp.provincia].filter(Boolean).join(', ') || '';

    const cantidad = Math.min(Math.max(parseInt(req.query.cantidad) || 1, 1), 100);
    let etiquetasHtml = '';
    for (let i = 0; i < cantidad; i++) {
      etiquetasHtml += `
<div class="etiqueta">
  <div class="empresa">${esc(razonSocial)}</div>
  <div class="producto">${esc(nombreProducto)}</div>
  <div class="qr-row">
    <div class="qr-box" id="qr-${i}"></div>
    <div>
      <div class="lote-label">N° LOTE</div>
      <div class="lote-num">${esc(numLote)}</div>
      <div style="font-size:9pt;margin-top:2mm;">${esc(tipoEnvase)}</div>
      <div style="font-size:8pt;color:#555;">${data.cantidad_envases || ''} unidades</div>
    </div>
  </div>
  <div class="campos">
    <div class="row"><span class="label">Fecha elaboración:</span> <span>${fechaElab}</span></div>
    <div class="row"><span class="label">Fecha envasado:</span> <span>${fechaEnv}</span></div>
    <div class="row"><span class="label">Fecha vencimiento:</span> <span>${fechaVenc}</span></div>
  </div>
  <div class="peso">Peso Neto: ${pesoNeto.toFixed(1)} Kg</div>
  <div class="regs">${[emp.rne ? 'RNE: '+emp.rne : '', emp.rnpa ? 'RNPA: '+emp.rnpa : '', emp.renspa ? 'RENSPA: '+emp.renspa : ''].filter(Boolean).join(' | ') || '—'}</div>
  <div class="dir">${esc(direccion)}</div>
</div>`;
    }

    const qrScript = Array.from({length: cantidad}, (_, i) =>
      `new QRCode(document.getElementById('qr-${i}'), { text: ${JSON.stringify(numLote)}, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });`
    ).join('\n  ');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Etiqueta ${numLote} (x${cantidad})</title>
<style>
  @page { size: 100mm auto; margin: 2mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; width:100mm; padding:3mm; }
  .etiqueta { border:2px solid #000; padding:3mm; page-break-after:always; }
  .empresa { font-size:14pt; font-weight:900; text-align:center; margin-bottom:2mm; text-transform:uppercase; }
  .producto { font-size:12pt; font-weight:700; text-align:center; margin-bottom:3mm; border-top:1px solid #000; border-bottom:1px solid #000; padding:2mm 0; }
  .qr-row { display:flex; align-items:center; gap:4mm; margin-bottom:3mm; }
  .qr-box { flex-shrink:0; }
  .qr-box img, .qr-box canvas { width:40mm; height:40mm; }
  .lote-num { font-size:18pt; font-weight:900; font-family:'Courier New',monospace; }
  .lote-label { font-size:8pt; color:#555; }
  .campos { font-size:9pt; line-height:1.8; }
  .campos .row { display:flex; justify-content:space-between; }
  .campos .label { font-weight:700; }
  .peso { font-size:16pt; font-weight:900; text-align:right; margin-top:2mm; padding-top:2mm; border-top:2px solid #000; }
  .regs { font-size:7pt; color:#555; margin-top:2mm; text-align:center; }
  .dir { font-size:7pt; color:#555; text-align:center; margin-top:1mm; }
  @media print { body { width:100mm; } }
</style>
</head>
<body>
${etiquetasHtml}
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<script>
  ${qrScript}
  setTimeout(function() { window.print(); }, 400);
<\/script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Error interno del servidor" });
  }
});

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

module.exports = router;
