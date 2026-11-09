#!/usr/bin/env bash
# Tests contra una BD separada (gestor_pacientes_test): correr la suite ya no
# contamina la base de desarrollo/piloto con pacientes y usuarios de prueba.
# Uso: bash scripts/test.sh
set -euo pipefail

DEV_DB="gestor_pacientes"
TEST_DB="gestor_pacientes_test"
BASE_URL="postgres://gestor:gestor_dev@localhost:5432"

docker exec gestor-pacientes-db dropdb -U gestor --if-exists "$TEST_DB"
docker exec gestor-pacientes-db createdb -U gestor "$TEST_DB"

cd "$(dirname "$0")/../apps/api"
DATABASE_URL="$BASE_URL/$TEST_DB" bunx drizzle-kit push --force >/dev/null
DATABASE_URL="$BASE_URL/$TEST_DB" bun test
echo "✓ Tests corrieron en $TEST_DB (la base $DEV_DB no se tocó)."
