# ══════════════════════════════════════════════════════════════
# CosechaApp — Dockerfile de la app Node
# Base: node:20-alpine (liviana, ~150MB)
# Expone: 3000
# Usuario: node (no-root)
# ══════════════════════════════════════════════════════════════

FROM node:20-alpine

# Instalar curl para healthcheck + wget como fallback
RUN apk add --no-cache curl

WORKDIR /app

# Copiar primero package*.json para aprovechar cache de layers
COPY package*.json ./

# Instalar solo dependencies (sin dev ni optional como serialport que no compila en alpine)
RUN npm ci --omit=dev --omit=optional --ignore-scripts

# Copiar el resto del código
COPY . .

# Crear directorio de uploads (se monta volumen encima)
RUN mkdir -p /app/uploads && chown -R node:node /app

# Usuario no-root
USER node

EXPOSE 3000

# Healthcheck usando el endpoint /health creado en Fase 1
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "server/index.js"]
