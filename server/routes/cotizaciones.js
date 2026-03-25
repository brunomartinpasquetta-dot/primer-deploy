const express  = require('express');
const router   = express.Router();
const { getPool, sql } = require('../db');
const cheerio  = require('cheerio');

// ── Caches ────────────────────────────────────────────────────────
let cacheDolar    = null, cacheDolarTime    = 0;
let cacheGranos   = null, cacheGranosTime   = 0;
let cacheFrutilla = null, cacheFrutillaTime = 0;

const CACHE_DOLAR    = 30 * 60 * 1000;  // 30 min
const CACHE_GRANOS   = 60 * 60 * 1000;  // 60 min
const CACHE_FRUTILLA = 60 * 60 * 1000;  // 60 min

// ── GET /api/cotizaciones/dolar ───────────────────────────────────
// Devuelve blue, oficial, MEP, CCL
router.get('/dolar', async (req, res) => {
  const now = Date.now();
  if (cacheDolar && (now - cacheDolarTime) < CACHE_DOLAR) {
    return res.json({ ...cacheDolar, cached: true });
  }
  try {
    const [blueRes, oficialRes, mepRes, cclRes] = await Promise.all([
      fetch('https://dolarapi.com/v1/dolares/blue'),
      fetch('https://dolarapi.com/v1/dolares/oficial'),
      fetch('https://dolarapi.com/v1/dolares/bolsa'),
      fetch('https://dolarapi.com/v1/dolares/contadoconliqui'),
    ]);
    if (!blueRes.ok) throw new Error('API externa no disponible');
    const [blue, oficial, mep, ccl] = await Promise.all([
      blueRes.json(),
      oficialRes.ok ? oficialRes.json() : null,
      mepRes.ok     ? mepRes.json()     : null,
      cclRes.ok     ? cclRes.json()     : null,
    ]);
    const ahora    = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const prevBlue = cacheDolar?.blue?.venta ?? null;
    cacheDolar = {
      blue:    { compra: blue.compra,          venta: blue.venta },
      oficial: oficial ? { compra: oficial.compra, venta: oficial.venta } : null,
      mep:     mep     ? { compra: mep.compra,     venta: mep.venta }     : null,
      ccl:     ccl     ? { compra: ccl.compra,     venta: ccl.venta }     : null,
      actualizado: ahora,
      variacion:   prevBlue !== null ? (blue.venta - prevBlue) : 0,
      cached: false,
    };
    cacheDolarTime = now;
    res.json(cacheDolar);
  } catch (err) {
    if (cacheDolar) return res.json({ ...cacheDolar, cached: true });
    res.status(503).json({ error: 'No se pudo obtener la cotización' });
  }
});

// ── GET /api/cotizaciones/granos ──────────────────────────────────
// FOB Rosario (MAGYP) + Chicago futuros (Yahoo Finance)
router.get('/granos', async (req, res) => {
  const now = Date.now();
  if (cacheGranos && (now - cacheGranosTime) < CACHE_GRANOS) {
    return res.json({ ...cacheGranos, cached: true });
  }

  const [fob, chicago] = await Promise.all([
    fetchFobRosario(),
    fetchChicago(),
  ]);

  if (!fob) {
    if (cacheGranos) return res.json({ ...cacheGranos, cached: true, aviso: 'Datos anteriores (API no disponible)' });
    return res.status(503).json({ error: 'No se pudo obtener precios FOB Rosario' });
  }

  const ahora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  cacheGranos = { fob, chicago, actualizado: ahora, cached: false };
  cacheGranosTime = now;
  res.json(cacheGranos);
});

// ── Helpers ───────────────────────────────────────────────────────

// Retrocede al último día hábil (lunes-viernes) desde una fecha
function ultimoDiaHabil(fecha = new Date()) {
  const d = new Date(fecha);
  // Retroceder si es sábado (6) o domingo (0)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function formatFechaMAGYP(d) {
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// NCM prefijos para cada grano (4 primeros dígitos)
const GRANOS_NCM = {
  soja:    '1201',
  trigo:   '1001',
  maiz:    '1005',
  girasol: '1206',
  sorgo:   '1007',
};

const GRANOS_LABEL = {
  soja: 'Soja', trigo: 'Trigo', maiz: 'Maíz', girasol: 'Girasol', sorgo: 'Sorgo',
};

async function fetchFobRosario() {
  // Intentar hoy primero, luego retroceder hasta 5 días hábiles
  try {
    let fecha = new Date();
    for (let intento = 0; intento < 7; intento++) {
      fecha = ultimoDiaHabil(fecha);
      const fechaStr = formatFechaMAGYP(fecha);
      const url = `https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/ws/ssma/precios_fob.php?Fecha=${encodeURIComponent(fechaStr)}`;
      const r   = await fetch(url);
      if (!r.ok) { fecha.setDate(fecha.getDate() - 1); continue; }
      const body = await r.json();

      // La API devuelve [] o { posts: [...] }
      const posts = Array.isArray(body) ? body : (body.posts || []);
      if (!posts.length) { fecha.setDate(fecha.getDate() - 1); continue; }

      // Construir resultado: para cada grano, buscar el precio del período más cercano
      const hoyMes  = new Date().getMonth() + 1;
      const hoyAnio = new Date().getFullYear();
      const result  = {};

      for (const [grano, ncmPrefix] of Object.entries(GRANOS_NCM)) {
        const matches = posts.filter(p => p.posicion.startsWith(ncmPrefix));
        if (!matches.length) continue;

        // Preferir el período más cercano al mes actual
        const ordenados = matches.sort((a, b) => {
          const diffA = (a.añoDesde - hoyAnio) * 12 + (a.mesDesde - hoyMes);
          const diffB = (b.añoDesde - hoyAnio) * 12 + (b.mesDesde - hoyMes);
          const posA  = diffA >= 0 ? diffA : 1000;
          const posB  = diffB >= 0 ? diffB : 1000;
          return posA - posB || a.precio - b.precio;
        });

        const p = ordenados[0];
        result[grano] = {
          cultivo:    GRANOS_LABEL[grano],
          precio_usd: p.precio,
          mes:        p.mesDesde,
          anio:       p.añoDesde,
        };
      }

      if (Object.keys(result).length > 0) {
        return { items: result, fecha: fechaStr };
      }
      fecha.setDate(fecha.getDate() - 1);
    }
    return null;
  } catch (err) {
    console.error('[granos] FOB error:', err.message);
    return null;
  }
}

// Conversión bushel → tonelada
const BUSHEL_TN = { soja: 36.744, trigo: 36.744, maiz: 39.368 };

async function fetchChicago() {
  // Yahoo Finance futuros CBOT: precios en USc/bushel
  const tickers = [
    { grano: 'soja',  ticker: 'ZS=F', bushel: BUSHEL_TN.soja  },
    { grano: 'trigo', ticker: 'ZW=F', bushel: BUSHEL_TN.trigo  },
    { grano: 'maiz',  ticker: 'ZC=F', bushel: BUSHEL_TN.maiz   },
  ];
  try {
    const results = await Promise.all(
      tickers.map(async ({ grano, ticker, bushel }) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
          const r   = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!r.ok) return { grano, precio_usd_tn: null };
          const data    = await r.json();
          const priceCents = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!priceCents) return { grano, precio_usd_tn: null };
          // Convertir: USc/bushel → USD/bushel → USD/tn
          const usdTn = Math.round((priceCents / 100) * bushel * 100) / 100;
          return { grano, precio_usd_tn: usdTn };
        } catch {
          return { grano, precio_usd_tn: null };
        }
      })
    );
    const out = {};
    results.forEach(r => { if (r.precio_usd_tn !== null) out[r.grano] = r.precio_usd_tn; });
    return Object.keys(out).length ? out : null;
  } catch (err) {
    console.error('[granos] Chicago error:', err.message);
    return null;
  }
}

// ── GET /api/cotizaciones/locales?cultivo=frutilla ───────────────
// Últimos 30 registros del cultivo, ordenados por fecha DESC
router.get('/locales', async (req, res) => {
  try {
    const pool   = await getPool();
    const req2   = pool.request();
    let   query  = `
      SELECT TOP 30
        id, cultivo, precio, unidad, comprador, observacion,
        CONVERT(NVARCHAR(16), fecha, 120) AS fecha,
        temporada_id
      FROM PreciosLocales`;

    if (req.query.cultivo) {
      req2.input('cultivo', sql.NVarChar, req.query.cultivo);
      query += ' WHERE cultivo = @cultivo';
    }
    query += ' ORDER BY fecha DESC';

    const result = await req2.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[locales] GET error:', err.message);
    res.status(500).json({ error: 'Error al obtener precios locales' });
  }
});

// ── POST /api/cotizaciones/locales ───────────────────────────────
router.post('/locales', async (req, res) => {
  const { cultivo, precio, unidad, comprador, observacion, temporada_id } = req.body;
  if (!cultivo || !precio || !unidad) {
    return res.status(400).json({ error: 'cultivo, precio y unidad son requeridos' });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('cultivo',      sql.NVarChar(50),  cultivo)
      .input('precio',       sql.Decimal(10, 2), parseFloat(precio))
      .input('unidad',       sql.NVarChar(20),  unidad)
      .input('comprador',    sql.NVarChar(100), comprador  || null)
      .input('observacion',  sql.NVarChar(200), observacion || null)
      .input('temporada_id', sql.Int,           temporada_id || null)
      .query(`
        INSERT INTO PreciosLocales (cultivo, precio, unidad, comprador, observacion, temporada_id)
        OUTPUT INSERTED.id, CONVERT(NVARCHAR(16), INSERTED.fecha, 120) AS fecha
        VALUES (@cultivo, @precio, @unidad, @comprador, @observacion, @temporada_id)
      `);
    res.json({ ok: true, ...result.recordset[0] });
  } catch (err) {
    console.error('[locales] POST error:', err.message);
    res.status(500).json({ error: 'Error al guardar precio local' });
  }
});

// ── GET /api/cotizaciones/frutilla ───────────────────────────────
// Scraping de preciosdelcentral.com
router.get('/frutilla', async (req, res) => {
  const now = Date.now();
  if (cacheFrutilla && (now - cacheFrutillaTime) < CACHE_FRUTILLA) {
    return res.json({ ...cacheFrutilla, cached: true });
  }

  try {
    const url = 'https://preciosdelcentral.com/buenosaires/detalles45/FRUTILLA/';
    const r   = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; bot)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const html = await r.text();
    const $    = cheerio.load(html);

    // La tabla tiene columnas:
    // 0:Precio 1:Mínimo 2:Máximo 3:Bulto 4:Origen 5:Calidad 6:Tamaño 7:Grado 8:$/Kg 9:Mín/Kg 10:Max/Kg
    // Los valores por kg están en data-ars de los spans .precio-convertible
    // Índices relativos dentro de cada fila (11 celdas por fila):
    const IDX_MODAL = 8;   // $/Kg
    const IDX_MIN   = 9;   // Mín/Kg
    const IDX_MAX   = 10;  // Max/Kg
    const IDX_BULTO = 3;   // texto del bulto

    const minKg = [], maxKg = [], modalKg = [];
    let unidad = null;

    $('table tbody tr').each(function () {
      const cells = $(this).find('td');
      if (cells.length < 11) return;

      function arsVal(idx) {
        const span = $(cells[idx]).find('[data-ars]');
        if (span.length) return parseFloat($(span).attr('data-ars'));
        const txt = $(cells[idx]).text().replace(/[^\d,.]/g, '').replace(',', '.');
        return txt ? parseFloat(txt) : null;
      }

      const modal = arsVal(IDX_MODAL);
      const min   = arsVal(IDX_MIN);
      const max   = arsVal(IDX_MAX);
      const bulto = $(cells[IDX_BULTO]).text().trim();

      if (modal && modal > 0) modalKg.push(modal);
      if (min   && min   > 0) minKg.push(min);
      if (max   && max   > 0) maxKg.push(max);

      // Unidad: extraer "kg" o "bandeja" del texto del bulto (ej. "Bandeja 5Kg")
      if (!unidad && bulto) {
        unidad = bulto.match(/bandeja/i) ? 'bandeja' : bulto.match(/caja/i) ? 'cajón' : 'kg';
      }
    });

    if (!modalKg.length && !minKg.length) {
      throw new Error('No se encontraron precios en la página');
    }

    // Modal = promedio de todos los $/Kg (representa el precio típico del día)
    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const precio_modal = avg(modalKg);
    const precio_min   = minKg.length   ? Math.min(...minKg)   : null;
    const precio_max   = maxKg.length   ? Math.max(...maxKg)   : null;

    // Fecha: buscar en la página (formato dd/mm/yyyy)
    let fecha = null;
    $('*').contents().filter(function () { return this.type === 'text'; }).each(function () {
      if (fecha) return;
      const m = this.data && this.data.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (m) fecha = m[0];
    });

    const result = {
      precio_min,
      precio_max,
      precio_modal,
      unidad:  unidad || '$/kg',
      fecha:   fecha  || new Date().toLocaleDateString('es-AR'),
      fuente:  'Mercado Central Buenos Aires',
      cached:  false,
    };

    cacheFrutilla     = result;
    cacheFrutillaTime = now;
    res.json(result);

  } catch (err) {
    console.error('[frutilla] scraping error:', err.message);
    if (cacheFrutilla) return res.json({ ...cacheFrutilla, cached: true });
    res.json({ error: true, mensaje: 'No disponible' });
  }
});

// Alias retrocompat
router.get('/todos', (req, res) => res.redirect('/api/cotizaciones/dolar'));

module.exports = router;
