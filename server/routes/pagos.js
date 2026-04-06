const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');

// ── Multer config ──────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../../uploads/comprobantes');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `pago-${req.params.id}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.jpg', '.jpeg'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Solo PDF/JPG'), ok);
  }
});

// ── Helpers ─────────────────────────────────────────────────────
async function nextRecibo(dbRequest) {
  const r = await dbRequest.query(`
    SELECT TOP 1 numero_recibo FROM Pagos
    WHERE numero_recibo IS NOT NULL AND numero_recibo LIKE 'REC-%'
    ORDER BY id DESC`);
  const year = new Date().getFullYear();
  if (!r.recordset.length) return `REC-${year}-0001`;
  const parts = r.recordset[0].numero_recibo.split('-');
  const num = parseInt(parts[2]) + 1;
  return `REC-${year}-${String(num).padStart(4, '0')}`;
}

async function getTemporadaActiva(pool) {
  const r = await pool.request().query('SELECT TOP 1 * FROM Temporadas WHERE activa = 1');
  return r.recordset[0] || null;
}

async function getPreciosMap(pool, temporadaId) {
  const r = await pool.request()
    .input('tid', sql.Int, temporadaId)
    .query('SELECT actividad, unidad, precio FROM PreciosRol WHERE temporada_id = @tid AND activo = 1');
  const m = {};
  r.recordset.forEach(p => { m[p.actividad] = { unidad: p.unidad, precio: parseFloat(p.precio) }; });
  return m;
}

// Calculate worker totals from all modules (used by multiple endpoints)
async function calcularTotalesTrabajador(pool, trabajadorId, fechaIni, fechaFin, temporadaId) {
  const req = pool.request()
    .input('tid', sql.Int, trabajadorId)
    .input('fi', sql.Date, fechaIni)
    .input('ff', sql.Date, fechaFin)
    .input('tempId', sql.Int, temporadaId);

  const r = await req.query(`
    SELECT
      (SELECT ISNULL(SUM(kilos),0) FROM Juntada
       WHERE juntador_id=@tid AND ISNULL(estado,'activa')!='anulada'
         AND fecha_hora>=@fi AND fecha_hora<DATEADD(DAY,1,@ff)) AS juntada_kilos,
      (SELECT ISNULL(SUM(kilos),0) FROM Despalillado
       WHERE despalillador_id=@tid AND ISNULL(estado,'activa')!='anulada'
         AND fecha_hora>=@fi AND fecha_hora<DATEADD(DAY,1,@ff)) AS despalillado_kilos,
      (SELECT ISNULL(SUM(DATEDIFF(MINUTE,hora_inicio,hora_fin)/60.0),0) FROM LoteClasificadores
       WHERE empleado_id=@tid AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
         AND ISNULL(fecha,CAST(hora_inicio AS DATE))>=@fi
         AND ISNULL(fecha,CAST(hora_inicio AS DATE))<=@ff) AS clasificacion_horas,
      (SELECT ISNULL(SUM(DATEDIFF(MINUTE,ae.hora_inicio,ae.hora_fin)/60.0),0)
       FROM AplicacionEmpleados ae JOIN Aplicaciones a ON ae.aplicacion_id=a.id
       WHERE ae.empleado_id=@tid AND ISNULL(a.estado,'activa')!='anulada'
         AND a.temporada_id=@tempId AND ae.hora_inicio IS NOT NULL AND ae.hora_fin IS NOT NULL) AS aplicacion_horas,
      (SELECT ISNULL(SUM(DATEDIFF(MINUTE,tt.hora_inicio,tt.hora_fin)/60.0),0)
       FROM TareaTrabajadores tt JOIN TareasGenerales tg ON tt.tarea_id=tg.id
       WHERE tt.trabajador_id=@tid AND ISNULL(tg.estado,'activa')!='anulada'
         AND tg.temporada_id=@tempId AND tt.hora_inicio IS NOT NULL AND tt.hora_fin IS NOT NULL) AS trabajo_campo_horas,
      (SELECT ISNULL(SUM(CASE WHEN tipo='anticipo' THEN monto ELSE 0 END),0) FROM Pagos
       WHERE juntador_id=@tid) AS anticipos,
      (SELECT ISNULL(SUM(CASE WHEN tipo='liquidacion' THEN ISNULL(monto_pagado,monto) ELSE 0 END),0) FROM Pagos
       WHERE juntador_id=@tid) AS liquidado
  `);
  return r.recordset[0];
}

function buildDesglose(totales, precios) {
  const items = [];
  let bruto = 0;
  const map = [
    { key: 'juntada', campo: 'juntada_kilos', label: 'Juntada' },
    { key: 'despalillado', campo: 'despalillado_kilos', label: 'Despalillado' },
    { key: 'clasificacion', campo: 'clasificacion_horas', label: 'Clasificacion' },
    { key: 'aplicacion', campo: 'aplicacion_horas', label: 'Aplicaciones' },
    { key: 'trabajo_campo', campo: 'trabajo_campo_horas', label: 'Trabajos campo' }
  ];
  map.forEach(m => {
    const cant = parseFloat(totales[m.campo]) || 0;
    const p = precios[m.key];
    if (cant > 0 && p) {
      const sub = Math.round(cant * p.precio * 100) / 100;
      items.push({ actividad: m.label, cantidad: Math.round(cant * 100) / 100, unidad: p.unidad === 'kilo' ? 'kg' : 'hs', precio: p.precio, subtotal: sub });
      bruto += sub;
    }
  });
  return { items, bruto: Math.round(bruto * 100) / 100 };
}

// ────────────────────────────────────────────────────────────────
// GET /precios
// ────────────────────────────────────────────────────────────────
router.get('/precios', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT pr.* FROM PreciosRol pr
      JOIN Temporadas t ON pr.temporada_id = t.id AND t.activa = 1
      WHERE pr.activo = 1 ORDER BY pr.actividad`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// PUT /precios/:id
// ────────────────────────────────────────────────────────────────
router.put('/precios/:id', async (req, res) => {
  try {
    const { precio } = req.body;
    if (!precio || parseFloat(precio) <= 0) return res.status(400).json({ error: 'Precio debe ser mayor a 0' });
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('precio', sql.Decimal(10, 2), precio)
      .query('UPDATE PreciosRol SET precio = @precio WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /trabajadores-con-saldo
// ────────────────────────────────────────────────────────────────
router.get('/trabajadores-con-saldo', async (req, res) => {
  try {
    const pool = await getPool();
    const temp = await getTemporadaActiva(pool);
    if (!temp) return res.json([]);
    const precios = await getPreciosMap(pool, temp.id);

    const result = await pool.request()
      .input('fi', sql.Date, temp.fecha_inicio)
      .input('ff', sql.Date, temp.fecha_fin)
      .input('tempId', sql.Int, temp.id)
      .query(`
        ;WITH JuntadaT AS (
          SELECT juntador_id AS wid, SUM(kilos) AS kilos
          FROM Juntada WHERE ISNULL(estado,'activa')!='anulada'
            AND fecha_hora>=@fi AND fecha_hora<DATEADD(DAY,1,@ff)
          GROUP BY juntador_id
        ), DespalilladoT AS (
          SELECT despalillador_id AS wid, SUM(kilos) AS kilos
          FROM Despalillado WHERE ISNULL(estado,'activa')!='anulada'
            AND fecha_hora>=@fi AND fecha_hora<DATEADD(DAY,1,@ff)
          GROUP BY despalillador_id
        ), ClasificacionT AS (
          SELECT empleado_id AS wid, SUM(DATEDIFF(MINUTE,hora_inicio,hora_fin)/60.0) AS horas
          FROM LoteClasificadores
          WHERE hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
            AND ISNULL(fecha,CAST(hora_inicio AS DATE))>=@fi
            AND ISNULL(fecha,CAST(hora_inicio AS DATE))<=@ff
          GROUP BY empleado_id
        ), AplicacionT AS (
          SELECT ae.empleado_id AS wid, SUM(DATEDIFF(MINUTE,ae.hora_inicio,ae.hora_fin)/60.0) AS horas
          FROM AplicacionEmpleados ae JOIN Aplicaciones a ON ae.aplicacion_id=a.id
          WHERE ISNULL(a.estado,'activa')!='anulada' AND a.temporada_id=@tempId
            AND ae.hora_inicio IS NOT NULL AND ae.hora_fin IS NOT NULL
          GROUP BY ae.empleado_id
        ), TrabajoT AS (
          SELECT tt.trabajador_id AS wid, SUM(DATEDIFF(MINUTE,tt.hora_inicio,tt.hora_fin)/60.0) AS horas
          FROM TareaTrabajadores tt JOIN TareasGenerales tg ON tt.tarea_id=tg.id
          WHERE ISNULL(tg.estado,'activa')!='anulada' AND tg.temporada_id=@tempId
            AND tt.hora_inicio IS NOT NULL AND tt.hora_fin IS NOT NULL
          GROUP BY tt.trabajador_id
        ), PagosT AS (
          SELECT juntador_id AS wid,
            SUM(CASE WHEN tipo='anticipo' THEN monto ELSE 0 END) AS anticipos,
            SUM(CASE WHEN tipo='liquidacion' THEN ISNULL(monto_pagado,monto) ELSE 0 END) AS liquidado
          FROM Pagos GROUP BY juntador_id
        )
        SELECT j.id, j.apellido+', '+j.nombre AS nombre,
          ISNULL(jt.kilos,0) AS juntada_kilos, ISNULL(dt.kilos,0) AS despalillado_kilos,
          ISNULL(ct.horas,0) AS clasificacion_horas, ISNULL(at2.horas,0) AS aplicacion_horas,
          ISNULL(wt.horas,0) AS trabajo_campo_horas,
          ISNULL(pt.anticipos,0) AS anticipos, ISNULL(pt.liquidado,0) AS liquidado
        FROM Juntadores j
        LEFT JOIN JuntadaT jt ON j.id=jt.wid
        LEFT JOIN DespalilladoT dt ON j.id=dt.wid
        LEFT JOIN ClasificacionT ct ON j.id=ct.wid
        LEFT JOIN AplicacionT at2 ON j.id=at2.wid
        LEFT JOIN TrabajoT wt ON j.id=wt.wid
        LEFT JOIN PagosT pt ON j.id=pt.wid
        WHERE j.activo=1 AND (
          ISNULL(jt.kilos,0)>0 OR ISNULL(dt.kilos,0)>0 OR ISNULL(ct.horas,0)>0
          OR ISNULL(at2.horas,0)>0 OR ISNULL(wt.horas,0)>0
          OR ISNULL(pt.anticipos,0)>0 OR ISNULL(pt.liquidado,0)>0)
        ORDER BY j.apellido, j.nombre`);

    const workers = result.recordset.map(w => {
      const { items, bruto } = buildDesglose(w, precios);
      const anticipos = parseFloat(w.anticipos) || 0;
      const liquidado = parseFloat(w.liquidado) || 0;
      return {
        trabajador_id: w.id, nombre: w.nombre, actividades: items,
        total_bruto: bruto, anticipos, liquidado,
        saldo_pendiente: Math.round((bruto - anticipos - liquidado) * 100) / 100
      };
    });
    workers.sort((a, b) => b.saldo_pendiente - a.saldo_pendiente);
    res.json(workers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /trabajador/:id/detalle
// ────────────────────────────────────────────────────────────────
router.get('/trabajador/:id/detalle', async (req, res) => {
  try {
    const pool = await getPool();
    const temp = await getTemporadaActiva(pool);
    if (!temp) return res.json({ error: 'Sin temporada activa' });
    const desde = req.query.desde || temp.fecha_inicio;
    const hasta = req.query.hasta || temp.fecha_fin;
    const tid = parseInt(req.params.id);
    const precios = await getPreciosMap(pool, temp.id);

    // Worker info
    const wRes = await pool.request().input('id', sql.Int, tid)
      .query("SELECT id, apellido+', '+nombre AS nombre FROM Juntadores WHERE id=@id");
    if (!wRes.recordset.length) return res.status(404).json({ error: 'Trabajador no encontrado' });
    const worker = wRes.recordset[0];

    // Juntada records
    const juntada = await pool.request()
      .input('tid', sql.Int, tid).input('fi', sql.Date, desde).input('ff', sql.Date, hasta)
      .query(`SELECT j.id, j.fecha_hora AS fecha, p.nombre AS parcela, j.kilos
              FROM Juntada j LEFT JOIN Parcelas p ON j.parcela_id=p.id
              WHERE j.juntador_id=@tid AND ISNULL(j.estado,'activa')!='anulada'
                AND j.fecha_hora>=@fi AND j.fecha_hora<DATEADD(DAY,1,@ff)
              ORDER BY j.fecha_hora`);

    // Despalillado records
    const despalillado = await pool.request()
      .input('tid', sql.Int, tid).input('fi', sql.Date, desde).input('ff', sql.Date, hasta)
      .query(`SELECT d.id, d.fecha_hora AS fecha, d.kilos
              FROM Despalillado d
              WHERE d.despalillador_id=@tid AND ISNULL(d.estado,'activa')!='anulada'
                AND d.fecha_hora>=@fi AND d.fecha_hora<DATEADD(DAY,1,@ff)
              ORDER BY d.fecha_hora`);

    // Clasificacion records
    const clasificacion = await pool.request()
      .input('tid', sql.Int, tid).input('fi', sql.Date, desde).input('ff', sql.Date, hasta)
      .query(`SELECT lc.id, ISNULL(lc.fecha,CAST(lc.hora_inicio AS DATE)) AS fecha,
                CAST(lc.lote_id AS VARCHAR) AS lote, lc.hora_inicio, lc.hora_fin
              FROM LoteClasificadores lc
              WHERE lc.empleado_id=@tid AND lc.hora_inicio IS NOT NULL AND lc.hora_fin IS NOT NULL
                AND ISNULL(lc.fecha,CAST(lc.hora_inicio AS DATE))>=@fi
                AND ISNULL(lc.fecha,CAST(lc.hora_inicio AS DATE))<=@ff
              ORDER BY lc.fecha`);

    // Aplicaciones records
    const aplicaciones = await pool.request()
      .input('tid', sql.Int, tid).input('tempId', sql.Int, temp.id)
      .input('fi', sql.Date, desde).input('ff', sql.Date, hasta)
      .query(`SELECT ae.id, a.fecha, p.nombre AS parcela, pr.nombre AS producto,
                ae.hora_inicio, ae.hora_fin
              FROM AplicacionEmpleados ae
              JOIN Aplicaciones a ON ae.aplicacion_id=a.id
              LEFT JOIN Parcelas p ON a.parcela_id=p.id
              LEFT JOIN Productos pr ON a.producto_id=pr.id
              WHERE ae.empleado_id=@tid AND ISNULL(a.estado,'activa')!='anulada'
                AND a.temporada_id=@tempId
                AND a.fecha>=@fi AND a.fecha<=@ff
                AND ae.hora_inicio IS NOT NULL AND ae.hora_fin IS NOT NULL
              ORDER BY a.fecha`);

    // Trabajos campo records
    const trabajos = await pool.request()
      .input('tid', sql.Int, tid).input('tempId', sql.Int, temp.id)
      .input('fi', sql.Date, desde).input('ff', sql.Date, hasta)
      .query(`SELECT tt.id, tg.fecha, tg.descripcion AS tarea, tt.hora_inicio, tt.hora_fin
              FROM TareaTrabajadores tt JOIN TareasGenerales tg ON tt.tarea_id=tg.id
              WHERE tt.trabajador_id=@tid AND ISNULL(tg.estado,'activa')!='anulada'
                AND tg.temporada_id=@tempId
                AND tg.fecha>=@fi AND tg.fecha<=@ff
                AND tt.hora_inicio IS NOT NULL AND tt.hora_fin IS NOT NULL
              ORDER BY tg.fecha`);

    // Pagos history
    const pagosHist = await pool.request().input('tid', sql.Int, tid)
      .query(`SELECT p.id, p.tipo, p.monto, p.fecha, p.estado_pago, p.numero_recibo, p.forma_pago,
                p.referencia_transferencia, p.comprobante_path, p.observacion, p.monto_total, p.monto_pagado,
                u.nombre AS operador_nombre
              FROM Pagos p LEFT JOIN Usuarios u ON p.usuario_id = u.id
              WHERE p.juntador_id=@tid ORDER BY p.fecha DESC, p.id DESC`);

    // Build response with calculated subtotals
    const calcHoras = (ini, fin) => {
      if (!ini || !fin) return 0;
      return Math.max(0, (new Date(fin) - new Date(ini)) / 3600000);
    };

    const pJunt = precios.juntada ? precios.juntada.precio : 0;
    const pDesp = precios.despalillado ? precios.despalillado.precio : 0;
    const pClas = precios.clasificacion ? precios.clasificacion.precio : 0;
    const pApli = precios.aplicacion ? precios.aplicacion.precio : 0;
    const pTrab = precios.trabajo_campo ? precios.trabajo_campo.precio : 0;

    let bruto = 0;
    const juntadaRows = juntada.recordset.map(r => {
      const k = parseFloat(r.kilos); const sub = Math.round(k * pJunt * 100) / 100;
      bruto += sub;
      return { ...r, kilos: k, precio: pJunt, subtotal: sub };
    });
    const despalilladoRows = despalillado.recordset.map(r => {
      const k = parseFloat(r.kilos); const sub = Math.round(k * pDesp * 100) / 100;
      bruto += sub;
      return { ...r, kilos: k, precio: pDesp, subtotal: sub };
    });
    const clasificacionRows = clasificacion.recordset.map(r => {
      const h = calcHoras(r.hora_inicio, r.hora_fin); const sub = Math.round(h * pClas * 100) / 100;
      bruto += sub;
      return { ...r, horas: Math.round(h * 100) / 100, precio: pClas, subtotal: sub };
    });
    const aplicacionesRows = aplicaciones.recordset.map(r => {
      const h = calcHoras(r.hora_inicio, r.hora_fin); const sub = Math.round(h * pApli * 100) / 100;
      bruto += sub;
      return { ...r, horas: Math.round(h * 100) / 100, precio: pApli, subtotal: sub };
    });
    const trabajosRows = trabajos.recordset.map(r => {
      const h = calcHoras(r.hora_inicio, r.hora_fin); const sub = Math.round(h * pTrab * 100) / 100;
      bruto += sub;
      return { ...r, horas: Math.round(h * 100) / 100, precio: pTrab, subtotal: sub };
    });

    bruto = Math.round(bruto * 100) / 100;
    let totalAnticipos = 0, totalLiquidado = 0;
    pagosHist.recordset.forEach(p => {
      if (p.tipo === 'anticipo') totalAnticipos += parseFloat(p.monto) || 0;
      if (p.tipo === 'liquidacion') totalLiquidado += parseFloat(p.monto_pagado || p.monto) || 0;
    });

    res.json({
      trabajador: worker,
      juntada: juntadaRows,
      despalillado: despalilladoRows,
      clasificacion: clasificacionRows,
      aplicaciones: aplicacionesRows,
      trabajos_campo: trabajosRows,
      pagos: pagosHist.recordset,
      resumen: {
        total_bruto: bruto,
        anticipos: Math.round(totalAnticipos * 100) / 100,
        liquidado: Math.round(totalLiquidado * 100) / 100,
        saldo: Math.round((bruto - totalAnticipos - totalLiquidado) * 100) / 100
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /anticipo
// ────────────────────────────────────────────────────────────────
router.post('/anticipo', async (req, res) => {
  const { trabajador_id, monto, forma_pago, referencia, observacion } = req.body;
  if (!trabajador_id) return res.status(400).json({ error: 'Trabajador es obligatorio' });
  if (!monto || parseFloat(monto) <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
  const pool = await getPool();

  // Validar que anticipo no cubra el total adeudado
  const temp = await getTemporadaActiva(pool);
  if (temp) {
    const precios = await getPreciosMap(pool, temp.id);
    const totales = await calcularTotalesTrabajador(pool, trabajador_id, temp.fecha_inicio, temp.fecha_fin, temp.id);
    const { bruto } = buildDesglose(totales, precios);
    const anticipos = parseFloat(totales.anticipos) || 0;
    const liquidado = parseFloat(totales.liquidado) || 0;
    const saldo = Math.round((bruto - anticipos - liquidado) * 100) / 100;
    if (parseFloat(monto) >= saldo - 0.01 && saldo > 0) {
      return res.status(400).json({ error: 'El monto ingresado es igual o mayor al total. Usa Liquidar para cerrar el pago.' });
    }
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const recibo = await nextRecibo(new sql.Request(transaction));

    const usuarioId = req.user ? req.user.id : null;
    const r1 = new sql.Request(transaction);
    const r1Result = await r1.input('jid', sql.Int, trabajador_id)
      .input('monto', sql.Decimal(12, 2), monto)
      .input('obs', sql.NVarChar, observacion || '')
      .input('fp', sql.VarChar(20), forma_pago || 'efectivo')
      .input('ref', sql.VarChar(100), referencia || null)
      .input('recibo', sql.VarChar(20), recibo)
      .input('uid', sql.Int, usuarioId)
      .query(`INSERT INTO Pagos (juntador_id, monto, tipo, observacion, forma_pago, referencia_transferencia,
              numero_recibo, estado_pago, monto_pagado, usuario_id)
              VALUES (@jid, @monto, 'anticipo', @obs, @fp, @ref, @recibo, 'pagado', @monto, @uid);
              SELECT SCOPE_IDENTITY() AS pago_id;`);
    const pagoId = r1Result.recordset && r1Result.recordset[0] ? r1Result.recordset[0].pago_id : null;

    // Worker name for Caja concepto
    const nameRes = await new sql.Request(transaction).input('id', sql.Int, trabajador_id)
      .query("SELECT apellido+', '+nombre AS n FROM Juntadores WHERE id=@id");
    const nombre = nameRes.recordset[0] ? nameRes.recordset[0].n : '';

    const r2 = new sql.Request(transaction);
    await r2.input('concepto', sql.NVarChar, `Anticipo ${nombre}`)
      .input('monto', sql.Decimal(12, 2), monto)
      .input('usuario', sql.NVarChar, req.user ? req.user.nombre : null)
      .input('medio', sql.NVarChar(20), forma_pago || 'efectivo')
      .input('tempId', sql.Int, temp ? temp.id : null)
      .query(`INSERT INTO Caja (tipo, concepto, monto, usuario_nombre, medio_pago, temporada_id)
              VALUES ('egreso', @concepto, @monto, @usuario, @medio, @tempId)`);

    await transaction.commit();
    res.json({ ok: true, numero_recibo: recibo, pago_id: pagoId });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /liquidar
// ────────────────────────────────────────────────────────────────
router.post('/liquidar', async (req, res) => {
  const { trabajador_id, monto_pagado, forma_pago, referencia, monto_efectivo, monto_transferencia, observacion } = req.body;
  if (!trabajador_id) return res.status(400).json({ error: 'Trabajador es obligatorio' });
  if (!monto_pagado || parseFloat(monto_pagado) <= 0) return res.status(400).json({ error: 'Monto debe ser mayor a 0' });
  if (!forma_pago) return res.status(400).json({ error: 'Forma de pago es obligatoria' });

  const pool = await getPool();
  const temp = await getTemporadaActiva(pool);
  if (!temp) return res.status(400).json({ error: 'Sin temporada activa' });
  const precios = await getPreciosMap(pool, temp.id);

  // Calculate current totals
  const totales = await calcularTotalesTrabajador(pool, trabajador_id, temp.fecha_inicio, temp.fecha_fin, temp.id);
  const { bruto } = buildDesglose(totales, precios);
  const anticipos = parseFloat(totales.anticipos) || 0;
  const liquidado = parseFloat(totales.liquidado) || 0;
  const saldo = Math.round((bruto - anticipos - liquidado) * 100) / 100;
  const montoPagar = parseFloat(monto_pagado);

  if (montoPagar > saldo + 0.01) return res.status(400).json({ error: `Monto ($${montoPagar}) supera saldo pendiente ($${saldo})` });

  if (forma_pago === 'mixto') {
    const me = parseFloat(monto_efectivo) || 0;
    const mt = parseFloat(monto_transferencia) || 0;
    if (Math.abs(me + mt - montoPagar) > 0.01) {
      return res.status(400).json({ error: 'Efectivo + transferencia deben sumar el total' });
    }
  }

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const recibo = await nextRecibo(new sql.Request(transaction));
    const estadoPago = montoPagar >= saldo - 0.01 ? 'pagado' : 'pago_parcial';

    const usuarioId = req.user ? req.user.id : null;
    const r1 = new sql.Request(transaction);
    const r1Result = await r1.input('jid', sql.Int, trabajador_id)
      .input('monto', sql.Decimal(12, 2), montoPagar)
      .input('monto_total', sql.Decimal(12, 2), bruto)
      .input('monto_pagado', sql.Decimal(12, 2), montoPagar)
      .input('anticipos', sql.Decimal(12, 2), anticipos)
      .input('total_bruto', sql.Decimal(12, 2), bruto)
      .input('saldo_final', sql.Decimal(12, 2), saldo - montoPagar)
      .input('fp', sql.VarChar(20), forma_pago)
      .input('ref', sql.VarChar(100), referencia || null)
      .input('recibo', sql.VarChar(20), recibo)
      .input('estado', sql.VarChar(20), estadoPago)
      .input('obs', sql.NVarChar, observacion || '')
      .input('desde', sql.Date, temp.fecha_inicio)
      .input('hasta', sql.Date, temp.fecha_fin)
      .input('uid', sql.Int, usuarioId)
      .query(`INSERT INTO Pagos (juntador_id, monto, tipo, monto_total, monto_pagado, anticipos,
              total_bruto, saldo_final, forma_pago, referencia_transferencia, numero_recibo,
              estado_pago, observacion, periodo_desde, periodo_hasta, usuario_id)
              VALUES (@jid, @monto, 'liquidacion', @monto_total, @monto_pagado, @anticipos,
              @total_bruto, @saldo_final, @fp, @ref, @recibo, @estado, @obs, @desde, @hasta, @uid);
              SELECT SCOPE_IDENTITY() AS pago_id;`);
    const pagoId = r1Result.recordset && r1Result.recordset[0] ? r1Result.recordset[0].pago_id : null;

    // Worker name
    const nameRes = await new sql.Request(transaction).input('id', sql.Int, trabajador_id)
      .query("SELECT apellido+', '+nombre AS n FROM Juntadores WHERE id=@id");
    const nombre = nameRes.recordset[0] ? nameRes.recordset[0].n : '';

    // Caja entries
    if (forma_pago === 'mixto') {
      const me = parseFloat(monto_efectivo) || 0;
      const mt = parseFloat(monto_transferencia) || 0;
      if (me > 0) {
        await new sql.Request(transaction)
          .input('concepto', sql.NVarChar, `Liquidacion ${nombre} - Efectivo`)
          .input('monto', sql.Decimal(12, 2), me)
          .input('usuario', sql.NVarChar, req.user ? req.user.nombre : null)
          .input('medio', sql.NVarChar(20), 'efectivo')
          .input('tempId', sql.Int, temp.id)
          .query(`INSERT INTO Caja (tipo,concepto,monto,usuario_nombre,medio_pago,temporada_id)
                  VALUES ('egreso',@concepto,@monto,@usuario,@medio,@tempId)`);
      }
      if (mt > 0) {
        await new sql.Request(transaction)
          .input('concepto', sql.NVarChar, `Liquidacion ${nombre} - Transferencia`)
          .input('monto', sql.Decimal(12, 2), mt)
          .input('usuario', sql.NVarChar, req.user ? req.user.nombre : null)
          .input('medio', sql.NVarChar(20), 'transferencia')
          .input('tempId', sql.Int, temp.id)
          .query(`INSERT INTO Caja (tipo,concepto,monto,usuario_nombre,medio_pago,temporada_id)
                  VALUES ('egreso',@concepto,@monto,@usuario,@medio,@tempId)`);
      }
    } else {
      await new sql.Request(transaction)
        .input('concepto', sql.NVarChar, `Liquidacion ${nombre}`)
        .input('monto', sql.Decimal(12, 2), montoPagar)
        .input('usuario', sql.NVarChar, req.user ? req.user.nombre : null)
        .input('medio', sql.NVarChar(20), forma_pago)
        .input('tempId', sql.Int, temp.id)
        .query(`INSERT INTO Caja (tipo,concepto,monto,usuario_nombre,medio_pago,temporada_id)
                VALUES ('egreso',@concepto,@monto,@usuario,@medio,@tempId)`);
    }

    await transaction.commit();
    res.json({ ok: true, numero_recibo: recibo, estado_pago: estadoPago, saldo_restante: Math.round((saldo - montoPagar) * 100) / 100, pago_id: pagoId });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /:id/comprobante
// ────────────────────────────────────────────────────────────────
router.post('/:id/comprobante', upload.single('comprobante'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo no proporcionado o formato invalido' });
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('path', sql.VarChar(255), req.file.filename)
      .query('UPDATE Pagos SET comprobante_path = @path WHERE id = @id');
    res.json({ ok: true, filename: req.file.filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /:id/comprobante
// ────────────────────────────────────────────────────────────────
router.get('/:id/comprobante', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT comprobante_path FROM Pagos WHERE id=@id');
    if (!r.recordset.length || !r.recordset[0].comprobante_path) return res.status(404).json({ error: 'Sin comprobante' });
    const filePath = path.join(uploadsDir, r.recordset[0].comprobante_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /:id/recibo — PDF
// ────────────────────────────────────────────────────────────────
router.get('/:id/recibo', async (req, res) => {
  try {
    const pool = await getPool();
    // Pago data
    const pRes = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Pagos WHERE id=@id');
    if (!pRes.recordset.length) return res.status(404).json({ error: 'Pago no encontrado' });
    const pago = pRes.recordset[0];

    // Worker
    const wRes = await pool.request().input('id', sql.Int, pago.juntador_id)
      .query("SELECT apellido+', '+nombre AS nombre FROM Juntadores WHERE id=@id");
    const nombre = wRes.recordset[0] ? wRes.recordset[0].nombre : 'Desconocido';

    // Operador
    let operadorNombre = '-';
    if (pago.usuario_id) {
      const opRes = await pool.request().input('uid', sql.Int, pago.usuario_id)
        .query('SELECT nombre FROM Usuarios WHERE id=@uid');
      if (opRes.recordset.length) operadorNombre = opRes.recordset[0].nombre;
    }

    // Empresa
    const eRes = await pool.request().query('SELECT TOP 1 * FROM ConfiguracionEmpresa');
    const emp = eRes.recordset[0] || {};

    // Detalle de actividades for liquidaciones
    const temp = await getTemporadaActiva(pool);
    let desglose = [];
    if (pago.tipo === 'liquidacion' && temp) {
      const precios = await getPreciosMap(pool, temp.id);
      const totales = await calcularTotalesTrabajador(pool, pago.juntador_id,
        pago.periodo_desde || temp.fecha_inicio, pago.periodo_hasta || temp.fecha_fin, temp.id);
      const { items } = buildDesglose(totales, precios);
      desglose = items;
    }

    // Format helper for PDF amounts
    const fmtMoney = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    // Generate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=recibo-${pago.numero_recibo || pago.id}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('COSECHA', { continued: true })
       .font('Helvetica').text(' - Sistema de Cultivos');
    if (emp.razon_social) doc.fontSize(10).text(emp.razon_social);
    if (emp.cuit) doc.text(`CUIT: ${emp.cuit}`);
    if (emp.direccion) doc.text(`${emp.direccion}${emp.localidad ? ', ' + emp.localidad : ''}${emp.provincia ? ', ' + emp.provincia : ''}`);
    doc.moveDown();

    // Recibo info
    doc.fontSize(16).font('Helvetica-Bold').text('RECIBO DE PAGO');
    const fechaPago = pago.fecha ? new Date(pago.fecha) : new Date();
    doc.fontSize(11).font('Helvetica')
       .text(`N\u00b0: ${pago.numero_recibo || '-'}`)
       .text(`Fecha: ${fechaPago.toLocaleDateString('es-AR')} ${fechaPago.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`)
       .text(`Tipo: ${pago.tipo === 'anticipo' ? 'Anticipo' : 'Liquidacion'}`)
       .text(`Trabajador: ${nombre}`)
       .text(`Operador: ${operadorNombre}`);
    doc.moveDown();

    // Activity detail for liquidaciones
    if (desglose.length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').text('DETALLE DE TRABAJOS');
      doc.moveDown(0.3);
      const tableTop = doc.y;
      const col = [50, 180, 280, 360, 440];
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Actividad', col[0], tableTop);
      doc.text('Cantidad', col[1], tableTop);
      doc.text('Precio', col[2], tableTop);
      doc.text('Subtotal', col[3], tableTop);
      doc.moveTo(50, tableTop + 14).lineTo(520, tableTop + 14).stroke();
      let y = tableTop + 20;
      doc.font('Helvetica').fontSize(9);
      desglose.forEach(item => {
        doc.text(item.actividad, col[0], y);
        doc.text(`${item.cantidad} ${item.unidad}`, col[1], y);
        doc.text(`${fmtMoney(item.precio)}/${item.unidad}`, col[2], y);
        doc.text(fmtMoney(item.subtotal), col[3], y);
        y += 16;
      });
      doc.moveTo(50, y).lineTo(520, y).stroke();
      y += 6;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Total Bruto:', col[0], y);
      doc.text(fmtMoney(pago.total_bruto), col[3], y);
      y += 16;
      if (parseFloat(pago.anticipos) > 0) {
        doc.font('Helvetica').text('Anticipos descontados:', col[0], y);
        doc.text(`-${fmtMoney(pago.anticipos)}`, col[3], y);
        y += 16;
      }
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('NETO PAGADO:', col[0], y);
      doc.text(fmtMoney(pago.monto_pagado || pago.monto), col[3], y);
      doc.y = y + 30;
    } else {
      // Anticipo
      doc.fontSize(12).font('Helvetica-Bold').text(`Monto: ${fmtMoney(pago.monto)}`);
      doc.moveDown();
    }

    // Forma de pago
    doc.fontSize(10).font('Helvetica');
    doc.text(`Forma de pago: ${pago.forma_pago || 'efectivo'}`);
    if (pago.referencia_transferencia) doc.text(`Referencia: ${pago.referencia_transferencia}`);
    if (pago.observacion) doc.text(`Observacion: ${pago.observacion}`);
    doc.moveDown(3);

    // Firma
    doc.fontSize(11).text('Recibi conforme ___________________________________________');
    doc.moveDown();
    doc.text('Firma: _____________________    Aclaracion: _____________________');

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /estadisticas
// ────────────────────────────────────────────────────────────────
router.get('/estadisticas', async (req, res) => {
  try {
    const pool = await getPool();
    const temp = await getTemporadaActiva(pool);
    if (!temp) return res.json({ error: 'Sin temporada activa' });
    const precios = await getPreciosMap(pool, temp.id);

    // Total pagado en la campana (anticipos + liquidaciones)
    const pagosRes = await pool.request().input('tempId', sql.Int, temp.id)
      .query(`SELECT
        ISNULL(SUM(CASE WHEN tipo='anticipo' THEN monto ELSE 0 END),0) AS total_anticipos,
        ISNULL(SUM(CASE WHEN tipo='liquidacion' THEN ISNULL(monto_pagado,monto) ELSE 0 END),0) AS total_liquidaciones
        FROM Pagos WHERE fecha >= (SELECT fecha_inicio FROM Temporadas WHERE id=@tempId)
          AND fecha <= (SELECT fecha_fin FROM Temporadas WHERE id=@tempId)`);
    const totPagos = pagosRes.recordset[0];

    // Desglose por actividad — bruto generado por cada actividad
    const allWorkersRes = await pool.request()
      .input('fi', sql.Date, temp.fecha_inicio)
      .input('ff', sql.Date, temp.fecha_fin)
      .input('tempId', sql.Int, temp.id)
      .query(`
        SELECT
          ISNULL(SUM(j.kilos),0) AS juntada_kilos
        FROM Juntada j WHERE ISNULL(j.estado,'activa')!='anulada'
          AND j.fecha_hora>=@fi AND j.fecha_hora<DATEADD(DAY,1,@ff);
        SELECT
          ISNULL(SUM(d.kilos),0) AS despalillado_kilos
        FROM Despalillado d WHERE ISNULL(d.estado,'activa')!='anulada'
          AND d.fecha_hora>=@fi AND d.fecha_hora<DATEADD(DAY,1,@ff);
        SELECT
          ISNULL(SUM(DATEDIFF(MINUTE,lc.hora_inicio,lc.hora_fin)/60.0),0) AS clasificacion_horas
        FROM LoteClasificadores lc
        WHERE lc.hora_inicio IS NOT NULL AND lc.hora_fin IS NOT NULL
          AND ISNULL(lc.fecha,CAST(lc.hora_inicio AS DATE))>=@fi
          AND ISNULL(lc.fecha,CAST(lc.hora_inicio AS DATE))<=@ff;
        SELECT
          ISNULL(SUM(DATEDIFF(MINUTE,ae.hora_inicio,ae.hora_fin)/60.0),0) AS aplicacion_horas
        FROM AplicacionEmpleados ae JOIN Aplicaciones a ON ae.aplicacion_id=a.id
        WHERE ISNULL(a.estado,'activa')!='anulada' AND a.temporada_id=@tempId
          AND ae.hora_inicio IS NOT NULL AND ae.hora_fin IS NOT NULL;
        SELECT
          ISNULL(SUM(DATEDIFF(MINUTE,tt.hora_inicio,tt.hora_fin)/60.0),0) AS trabajo_campo_horas
        FROM TareaTrabajadores tt JOIN TareasGenerales tg ON tt.tarea_id=tg.id
        WHERE ISNULL(tg.estado,'activa')!='anulada' AND tg.temporada_id=@tempId
          AND tt.hora_inicio IS NOT NULL AND tt.hora_fin IS NOT NULL
      `);
    const actDesglose = [];
    const pj = precios.juntada;
    const pd = precios.despalillado;
    const pc = precios.clasificacion;
    const pa = precios.aplicacion;
    const pt = precios.trabajo_campo;
    const jk = parseFloat(allWorkersRes.recordsets[0][0].juntada_kilos) || 0;
    const dk = parseFloat(allWorkersRes.recordsets[1][0].despalillado_kilos) || 0;
    const ch = parseFloat(allWorkersRes.recordsets[2][0].clasificacion_horas) || 0;
    const ah = parseFloat(allWorkersRes.recordsets[3][0].aplicacion_horas) || 0;
    const th = parseFloat(allWorkersRes.recordsets[4][0].trabajo_campo_horas) || 0;
    if (jk > 0 && pj) actDesglose.push({ actividad: 'Juntada', cantidad: Math.round(jk*100)/100, unidad: 'kg', monto: Math.round(jk * pj.precio * 100)/100 });
    if (dk > 0 && pd) actDesglose.push({ actividad: 'Despalillado', cantidad: Math.round(dk*100)/100, unidad: 'kg', monto: Math.round(dk * pd.precio * 100)/100 });
    if (ch > 0 && pc) actDesglose.push({ actividad: 'Clasificacion', cantidad: Math.round(ch*100)/100, unidad: 'hs', monto: Math.round(ch * pc.precio * 100)/100 });
    if (ah > 0 && pa) actDesglose.push({ actividad: 'Aplicaciones', cantidad: Math.round(ah*100)/100, unidad: 'hs', monto: Math.round(ah * pa.precio * 100)/100 });
    if (th > 0 && pt) actDesglose.push({ actividad: 'Trabajos campo', cantidad: Math.round(th*100)/100, unidad: 'hs', monto: Math.round(th * pt.precio * 100)/100 });

    // Gasto semanal ultimas 4 semanas
    const semanalRes = await pool.request()
      .query(`SELECT
        DATEPART(ISOWK, fecha) AS semana,
        MIN(fecha) AS semana_inicio,
        ISNULL(SUM(ISNULL(monto_pagado, monto)),0) AS total
        FROM Pagos
        WHERE fecha >= DATEADD(WEEK, -4, GETDATE())
        GROUP BY DATEPART(ISOWK, fecha)
        ORDER BY semana`);

    // Trabajadores con deuda pendiente > 0
    // Reuse the workers-con-saldo logic but simplified
    const workersRes = await pool.request()
      .input('fi', sql.Date, temp.fecha_inicio)
      .input('ff', sql.Date, temp.fecha_fin)
      .input('tempId', sql.Int, temp.id)
      .query(`
        ;WITH PagosT AS (
          SELECT juntador_id AS wid,
            SUM(CASE WHEN tipo='anticipo' THEN monto ELSE 0 END) AS anticipos,
            SUM(CASE WHEN tipo='liquidacion' THEN ISNULL(monto_pagado,monto) ELSE 0 END) AS liquidado
          FROM Pagos GROUP BY juntador_id
        )
        SELECT j.id, j.apellido+', '+j.nombre AS nombre,
          ISNULL(pt.anticipos,0) AS anticipos, ISNULL(pt.liquidado,0) AS liquidado
        FROM Juntadores j
        LEFT JOIN PagosT pt ON j.id=pt.wid
        WHERE j.activo=1
        ORDER BY j.apellido, j.nombre`);

    // Calculate bruto for each worker and filter deudores
    const deudores = [];
    for (const w of workersRes.recordset) {
      const tots = await calcularTotalesTrabajador(pool, w.id, temp.fecha_inicio, temp.fecha_fin, temp.id);
      const { bruto } = buildDesglose(tots, precios);
      const ant = parseFloat(w.anticipos) || 0;
      const liq = parseFloat(w.liquidado) || 0;
      const saldo = Math.round((bruto - ant - liq) * 100) / 100;
      if (saldo > 0) deudores.push({ nombre: w.nombre, saldo });
    }
    deudores.sort((a, b) => b.saldo - a.saldo);

    // Trabajadores sin actividad en los ultimos 7 dias
    const inactivosRes = await pool.request()
      .input('tempId', sql.Int, temp.id)
      .query(`
        SELECT j.id, j.apellido+', '+j.nombre AS nombre
        FROM Juntadores j WHERE j.activo=1
        AND j.id NOT IN (
          SELECT juntador_id FROM Juntada WHERE ISNULL(estado,'activa')!='anulada' AND fecha_hora >= DATEADD(DAY,-7,GETDATE())
          UNION SELECT despalillador_id FROM Despalillado WHERE ISNULL(estado,'activa')!='anulada' AND fecha_hora >= DATEADD(DAY,-7,GETDATE())
          UNION SELECT ae.empleado_id FROM AplicacionEmpleados ae JOIN Aplicaciones a ON ae.aplicacion_id=a.id WHERE ISNULL(a.estado,'activa')!='anulada' AND a.fecha >= DATEADD(DAY,-7,GETDATE())
          UNION SELECT tt.trabajador_id FROM TareaTrabajadores tt JOIN TareasGenerales tg ON tt.tarea_id=tg.id WHERE ISNULL(tg.estado,'activa')!='anulada' AND tg.fecha >= DATEADD(DAY,-7,GETDATE())
          UNION SELECT empleado_id FROM LoteClasificadores WHERE hora_inicio >= DATEADD(DAY,-7,GETDATE())
        )
        AND j.id IN (
          SELECT juntador_id FROM Juntada WHERE ISNULL(estado,'activa')!='anulada'
          UNION SELECT despalillador_id FROM Despalillado WHERE ISNULL(estado,'activa')!='anulada'
          UNION SELECT ae.empleado_id FROM AplicacionEmpleados ae
          UNION SELECT tt.trabajador_id FROM TareaTrabajadores tt
          UNION SELECT empleado_id FROM LoteClasificadores
        )
        ORDER BY j.apellido, j.nombre`);

    res.json({
      total_anticipos: parseFloat(totPagos.total_anticipos) || 0,
      total_liquidaciones: parseFloat(totPagos.total_liquidaciones) || 0,
      total_pagado: (parseFloat(totPagos.total_anticipos) || 0) + (parseFloat(totPagos.total_liquidaciones) || 0),
      desglose_actividad: actDesglose,
      gasto_semanal: semanalRes.recordset.map(s => ({
        semana: s.semana,
        semana_inicio: s.semana_inicio,
        total: parseFloat(s.total) || 0
      })),
      deudores,
      inactivos: inactivosRes.recordset.map(r => r.nombre)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /historial
// ────────────────────────────────────────────────────────────────
router.get('/historial', async (req, res) => {
  try {
    const { trabajador_id, tipo, forma_pago, desde, hasta } = req.query;
    const pool = await getPool();
    const r = pool.request();
    let where = '1=1';
    if (trabajador_id) { r.input('tid', sql.Int, trabajador_id); where += ' AND p.juntador_id=@tid'; }
    if (tipo) { r.input('tipo', sql.NVarChar, tipo); where += ' AND p.tipo=@tipo'; }
    if (forma_pago) { r.input('fp', sql.VarChar(20), forma_pago); where += ' AND p.forma_pago=@fp'; }
    if (desde) { r.input('desde', sql.Date, desde); where += ' AND p.fecha>=@desde'; }
    if (hasta) { r.input('hasta', sql.Date, hasta); where += ' AND p.fecha<=@hasta'; }

    const result = await r.query(`
      SELECT p.*, j.apellido+', '+j.nombre AS trabajador, u.nombre AS operador_nombre
      FROM Pagos p LEFT JOIN Juntadores j ON p.juntador_id=j.id
      LEFT JOIN Usuarios u ON p.usuario_id=u.id
      WHERE ${where} ORDER BY p.fecha DESC, p.id DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
