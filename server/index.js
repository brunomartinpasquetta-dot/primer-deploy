require('dotenv').config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no definida en .env');
  process.exit(1);
}

const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');
const path = require('path');

const requireAuth = require('./middleware/auth');
const { soloAdmin, encargadoOAdmin } = require('./middleware/roles');

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Rutas públicas ──────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/cotizaciones', require('./routes/cotizaciones'));  // GET público, POST protegido en la ruta

// ── Dashboard ───────────────────────────────────────────────────
app.use('/api/dashboard',  requireAuth, encargadoOAdmin, require('./routes/dashboard'));

// ── Depósitos ────────────────────────────────────────────────────
app.use('/api/depositos',  requireAuth, encargadoOAdmin, require('./routes/depositos'));

// ── Rutas solo admin ────────────────────────────────────────────
app.use('/api/balance',           requireAuth, soloAdmin, require('./routes/balance'));
app.use('/api/caja',              requireAuth, soloAdmin, require('./routes/caja'));
app.use('/api/cheques',           requireAuth, soloAdmin, require('./routes/cheques'));
app.use('/api/pagos',             requireAuth, soloAdmin, require('./routes/pagos'));
app.use('/api/gastos',            requireAuth, soloAdmin, require('./routes/gastos'));
app.use('/api/cuentas-proveedores', requireAuth, soloAdmin, require('./routes/cuentas-proveedores'));
app.use('/api/cuentas-clientes',  requireAuth, soloAdmin, require('./routes/cuentas-clientes'));
app.use('/api/usuarios',          requireAuth, soloAdmin, require('./routes/usuarios'));
app.use('/api/remitos',           requireAuth, soloAdmin, require('./routes/remitos'));

// ── Rutas encargado y admin ─────────────────────────────────────
app.use('/api/aplicaciones',      requireAuth, encargadoOAdmin, require('./routes/aplicaciones'));
app.use('/api/parcelas',          requireAuth, encargadoOAdmin, require('./routes/lotes'));
app.use('/api/juntadores',        requireAuth, encargadoOAdmin, require('./routes/juntadores'));
app.use('/api/juntada',           requireAuth, encargadoOAdmin, require('./routes/juntada'));
app.use('/api/despalillado',      requireAuth, encargadoOAdmin, require('./routes/despalillado'));
app.use('/api/clasificacion-embalaje', requireAuth, encargadoOAdmin, require('./routes/clasificacion-embalaje'));
app.use('/api/categorias-fruta', requireAuth, encargadoOAdmin, require('./routes/categorias-fruta'));
app.use('/api/categorias-clasificacion', requireAuth, encargadoOAdmin, require('./routes/categorias-clasificacion'));
app.use('/api/reportes',          requireAuth, encargadoOAdmin, require('./routes/reportes'));
app.use('/api/temporadas',        requireAuth, encargadoOAdmin, require('./routes/temporadas'));
app.use('/api/productos',         requireAuth, encargadoOAdmin, require('./routes/productos'));
app.use('/api/stock-insumos',     requireAuth, encargadoOAdmin, require('./routes/stock-insumos'));
app.use('/api/stock-mercaderia',  requireAuth, encargadoOAdmin, require('./routes/stock-mercaderia'));
app.use('/api/proveedores',       requireAuth, encargadoOAdmin, require('./routes/proveedores'));
app.use('/api/compras',           requireAuth, encargadoOAdmin, require('./routes/compras'));
app.use('/api/clientes',          requireAuth, encargadoOAdmin, require('./routes/clientes'));
app.use('/api/personal',          requireAuth, encargadoOAdmin, require('./routes/personal'));
app.use('/api/roles-trabajo',     requireAuth, encargadoOAdmin, require('./routes/roles-trabajo'));
app.use('/api/permisos',          requireAuth, require('./routes/permisos'));
app.use('/api/configuracion-empresa', requireAuth, encargadoOAdmin, require('./routes/configuracion-empresa'));

// WebSocket para balanza
wss.on('connection', (ws) => {
  console.log('Cliente conectado al WebSocket');
  ws.on('close', () => console.log('Cliente desconectado'));
});

// Función global para enviar peso a todos los clientes
global.broadcastPeso = (peso) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ tipo: 'peso', valor: peso }));
    }
  });
};

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
