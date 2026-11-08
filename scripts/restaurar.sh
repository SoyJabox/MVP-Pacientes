#!/usr/bin/env bash
# Restaura un backup en una base NUEVA y compara el conteo de filas.
# No toca la base de desarrollo: restaura en gestor_pacientes_verificacion
# y la borra al final. Sirve como prueba mensual de que el backup sirve.
# Uso: ./scripts/restaurar.sh backups/gestor_pacientes_2026-11-08_030000.dump
set -euo pipefail

ARCHIVO="${1:?Uso: ./scripts/restaurar.sh <archivo.dump>}"
CONTENEDOR="gestor-pacientes-db"
VERIF="gestor_pacientes_verificacion"
USUARIO="gestor"
ORIGEN="gestor_pacientes"

[ -f "$ARCHIVO" ] || { echo "✗ No existe $ARCHIVO" >&2; exit 1; }

echo "→ Restaurando $ARCHIVO en base temporal $VERIF"
docker exec "$CONTENEDOR" dropdb -U "$USUARIO" --if-exists "$VERIF"
docker exec "$CONTENEDOR" createdb -U "$USUARIO" "$VERIF"
docker exec -i "$CONTENEDOR" pg_restore -U "$USUARIO" -d "$VERIF" --no-owner < "$ARCHIVO"

# Comparar conteos tabla por tabla: un restore "sin errores" pero vacío no sirve.
FALLO=0
TABLAS=$(docker exec "$CONTENEDOR" psql -U "$USUARIO" -d "$VERIF" -tAc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")

for T in $TABLAS; do
  A=$(docker exec "$CONTENEDOR" psql -U "$USUARIO" -d "$ORIGEN" -tAc "SELECT count(*) FROM \"$T\"")
  B=$(docker exec "$CONTENEDOR" psql -U "$USUARIO" -d "$VERIF" -tAc "SELECT count(*) FROM \"$T\"")
  if [ "$A" = "$B" ]; then
    echo "  ✓ $T: $B filas"
  else
    echo "  ✗ $T: origen $A vs restaurado $B" >&2
    FALLO=1
  fi
done

docker exec "$CONTENEDOR" dropdb -U "$USUARIO" --if-exists "$VERIF"

if [ "$FALLO" -eq 1 ]; then
  echo "✗ Restauración NO coincide con el origen." >&2
  exit 1
fi
echo "✓ Restauración verificada: todos los conteos coinciden."
