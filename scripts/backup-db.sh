#!/bin/bash
# ══════════════════════════════════════════════════════════════
# CosechaApp — Backup de DB
# Genera un .bak completo, lo copia al host, comprime y rota viejos.
#
# Uso manual:
#   bash scripts/backup-db.sh
#
# Agendar con cron en el VPS (backup nocturno 03:00):
#   sudo crontab -e
#   0 3 * * * cd /home/cosecha/cosecha-app && /bin/bash scripts/backup-db.sh >> /var/log/cosecha-backup.log 2>&1
#
# Retención: 30 días. Archivos más viejos se borran automáticamente.
# ══════════════════════════════════════════════════════════════
set -e

CONTAINER="cosecha-db"
DB_NAME="${DB_NAME:-CosechaFrutilla}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS=30
FECHA=$(date +%Y-%m-%d_%H%M%S)
FILE_IN_CONTAINER="/var/opt/mssql/backups/backup-${FECHA}.bak"
FILE_ON_HOST="${BACKUP_DIR}/backup-${FECHA}.bak"

# Cargar DB_PASSWORD desde .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs -0 2>/dev/null || cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: DB_PASSWORD no definida. Exportala o ponela en .env"
  exit 1
fi

# -b: sqlcmd sale con código != 0 si el BACKUP falla (para que set -e frene el script)
SQLCMD="/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $DB_PASSWORD -C -No -b"

echo "═══ Backup DB: $DB_NAME ═══"
echo "  Fecha: $FECHA"

mkdir -p "$BACKUP_DIR"

# 1. Crear directorio de backups dentro del container (si no existe)
docker exec $CONTAINER mkdir -p /var/opt/mssql/backups

# 2. Ejecutar BACKUP DATABASE
echo "→ Generando .bak dentro del container..."
docker exec $CONTAINER $SQLCMD -Q \
  "BACKUP DATABASE [$DB_NAME] TO DISK = '${FILE_IN_CONTAINER}' WITH INIT, STATS = 10;"
# Sin COMPRESSION: la edición Express (MSSQL_PID=Express en docker-compose) no la soporta
# (Msg 1844). El .bak se comprime igual con gzip en el paso 4.
echo "  OK"

# 3. Copiar al host
echo "→ Copiando al host: $FILE_ON_HOST"
docker cp "${CONTAINER}:${FILE_IN_CONTAINER}" "$FILE_ON_HOST"

# 4. Comprimir con gzip
echo "→ Comprimiendo..."
gzip "$FILE_ON_HOST"
SIZE=$(du -h "${FILE_ON_HOST}.gz" | cut -f1)
echo "  OK — ${FILE_ON_HOST}.gz ($SIZE)"

# 5. Borrar .bak del container (ya lo tenemos en el host)
docker exec $CONTAINER rm -f "$FILE_IN_CONTAINER"

# 6. Rotación: borrar backups de más de RETENTION_DAYS días
echo "→ Rotación: borrando backups de más de ${RETENTION_DAYS} días..."
find "$BACKUP_DIR" -name "backup-*.bak.gz" -type f -mtime +${RETENTION_DAYS} -delete
KEPT=$(find "$BACKUP_DIR" -name "backup-*.bak.gz" -type f | wc -l | tr -d ' ')
echo "  Backups retenidos: $KEPT"

echo "═══ Backup completo ═══"
