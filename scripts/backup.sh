#!/usr/bin/env bash
# Backup de PostgreSQL con verificación de integridad.
# Uso: ./scripts/backup.sh [directorio_destino]
# Cron sugerido: 0 3 * * * cd /ruta/gestor-pacientes && ./scripts/backup.sh /mnt/disco-externo/backups
set -euo pipefail

DESTINO="${1:-./backups}"
CONTENEDOR="gestor-pacientes-db"
DB="gestor_pacientes"
USUARIO="gestor"
FECHA="$(date +%Y-%m-%d_%H%M%S)"
ARCHIVO="$DESTINO/gestor_pacientes_$FECHA.dump"

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

echo "→ Backup $DB → $ARCHIVO"
docker exec "$CONTENEDOR" pg_dump -U "$USUARIO" -d "$DB" -Fc > "$ARCHIVO"
chmod 600 "$ARCHIVO"

# Un dump vacío o truncado no es un backup: verificarlo ahora, no al restaurar.
TAMANO=$(stat -c %s "$ARCHIVO")
if [ "$TAMANO" -lt 1000 ]; then
  echo "✗ Backup sospechosamente chico ($TAMANO bytes). Abortando." >&2
  exit 1
fi

if ! docker exec -i "$CONTENEDOR" pg_restore --list < "$ARCHIVO" > /dev/null 2>&1; then
  echo "✗ El dump no se puede leer con pg_restore. Backup inválido." >&2
  exit 1
fi

echo "✓ Backup OK ($TAMANO bytes)"
echo "  Restaurar con: ./scripts/restaurar.sh $ARCHIVO"
