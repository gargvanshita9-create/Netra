#!/bin/bash
# Runs first (00 < 01) inside docker-entrypoint-initdb.d. The official
# Postgres image executes plain .sql files with `psql -f` and no way to pass
# `-v`, so 01-readonly-role.sql (mounted outside initdb.d, at
# /opt/netra-sql, so it isn't auto-executed a second time) is applied here
# with the password supplied explicitly.
set -euo pipefail

if [ -z "${NETRA_RO_PASSWORD:-}" ]; then
  echo "NETRA_RO_PASSWORD is not set — cannot create the netra_ro role." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v ro_password="$NETRA_RO_PASSWORD" \
  -f /opt/netra-sql/01-readonly-role.sql
