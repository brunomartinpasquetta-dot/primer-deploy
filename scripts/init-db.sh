#!/bin/bash
# ══════════════════════════════════════════════════════════════
# CosechaApp — Init DB
# Crea la DB, ejecuta schema + seed dentro del container cosecha-db.
# Idempotente: si la DB ya tiene tablas, skippea el schema.
#
# Uso (después de docker compose up -d):
#   bash scripts/init-db.sh
#
# Requiere: container cosecha-db corriendo y healthy
# ══════════════════════════════════════════════════════════════
set -e

CONTAINER="cosecha-db"
DB_NAME="${DB_NAME:-CosechaFrutilla}"

# Cargar DB_PASSWORD desde .env del proyecto
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs -0 2>/dev/null || cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: DB_PASSWORD no definida. Exportala o ponela en .env"
  exit 1
fi

SQLCMD="/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $DB_PASSWORD -C -No"

echo "═══ Init DB: $DB_NAME ═══"

# 1. Verificar que el container está corriendo
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: container $CONTAINER no está corriendo. Ejecutá 'docker compose up -d' primero."
  exit 1
fi

# 2. Esperar a que SQL Server esté listo (hasta 60s)
echo "→ Esperando SQL Server..."
for i in 1 2 3 4 5 6; do
  if docker exec $CONTAINER $SQLCMD -Q "SELECT 1" > /dev/null 2>&1; then
    echo "  OK"
    break
  fi
  echo "  intento $i/6..."
  sleep 10
done

# 3. Crear la DB si no existe
echo "→ Creando DB $DB_NAME si no existe..."
docker exec $CONTAINER $SQLCMD -Q \
  "IF DB_ID('$DB_NAME') IS NULL CREATE DATABASE [$DB_NAME];"

# 4. Verificar si ya tiene tablas (idempotencia)
TABLAS=$(docker exec $CONTAINER $SQLCMD -d $DB_NAME -h -1 -Q \
  "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.tables WHERE name NOT LIKE '_bkp%';" 2>/dev/null | tr -d ' \r\n' | head -c 5)

if [ "$TABLAS" -gt "0" ] 2>/dev/null; then
  echo "→ DB ya tiene $TABLAS tablas. Skip schema (idempotente)."
else
  echo "→ Ejecutando schema-full-2026-04-09.sql..."
  docker exec $CONTAINER $SQLCMD -d $DB_NAME -i /scripts/schema-full-2026-04-09.sql
  echo "  OK"

  echo "→ Ejecutando seed-catalogos-2026-04-09.sql..."
  docker exec $CONTAINER $SQLCMD -d $DB_NAME -i /scripts/seed-catalogos-2026-04-09.sql
  echo "  OK"
fi

# 5. Verificación final
COUNT=$(docker exec $CONTAINER $SQLCMD -d $DB_NAME -h -1 -Q \
  "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.tables WHERE name NOT LIKE '_bkp%';" 2>/dev/null | tr -d ' \r\n' | head -c 5)
VARIEDADES=$(docker exec $CONTAINER $SQLCMD -d $DB_NAME -h -1 -Q \
  "SET NOCOUNT ON; SELECT COUNT(*) FROM variedades_frutilla;" 2>/dev/null | tr -d ' \r\n' | head -c 5)

echo "═══ Init DB completo ═══"
echo "  Tablas: $COUNT"
echo "  Variedades frutilla: $VARIEDADES"
echo ""
echo "Próximo paso: el container app se conectará automáticamente y creará el usuario admin"
