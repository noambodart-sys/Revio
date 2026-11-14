#!/usr/bin/env bash
# Crée la base locale et les 3 rôles PostgreSQL de Revio (développement uniquement).
#   revio_owner  : propriétaire du schéma, migrations
#   revio_app    : rôle de l'application, soumis à la Row Level Security
#   revio_system : BYPASSRLS, réservé à l'authentification, l'admin Revio et aux jobs
# Usage : bash scripts/db-setup.sh [--reset] [nom_base]
set -euo pipefail
RESET=0
if [[ "${1:-}" == "--reset" ]]; then RESET=1; shift; fi
DB="${1:-revio}"
PSQL=(psql -d postgres -v ON_ERROR_STOP=1 -q)
if [[ "$(id -u)" == "0" ]] && id postgres >/dev/null 2>&1; then PSQL=(sudo -u postgres "${PSQL[@]}"); fi

"${PSQL[@]}" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'revio_owner') THEN
    CREATE ROLE revio_owner LOGIN PASSWORD 'revio_owner_dev' CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'revio_app') THEN
    CREATE ROLE revio_app LOGIN PASSWORD 'revio_app_dev' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'revio_system') THEN
    CREATE ROLE revio_system LOGIN PASSWORD 'revio_system_dev' BYPASSRLS;
  END IF;
END \$\$;
SQL

if [[ $RESET == 1 ]]; then
  "${PSQL[@]}" -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);"
fi
if ! "${PSQL[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB'" | grep -q 1; then
  "${PSQL[@]}" -c "CREATE DATABASE \"$DB\" OWNER revio_owner;"
fi
echo "Base \"$DB\" prête."
