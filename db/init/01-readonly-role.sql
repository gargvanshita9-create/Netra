-- Canonical read-only role definition — see PROJECT_PLAN.md §4.3.
-- This file is the source of truth and is applied both in local Docker
-- (via 00-readonly-role.sh, which supplies :ro_password) and, unmodified,
-- against any future non-Docker Postgres instance:
--   psql -v ro_password='...' -f db/init/01-readonly-role.sql
--
-- Do not hardcode the password here — it must stay out of git.

CREATE ROLE netra_ro LOGIN PASSWORD :'ro_password';
REVOKE ALL ON DATABASE netra_demo FROM PUBLIC;
GRANT CONNECT ON DATABASE netra_demo TO netra_ro;
GRANT USAGE ON SCHEMA public TO netra_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO netra_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO netra_ro;
ALTER ROLE netra_ro SET statement_timeout = '10s';
ALTER ROLE netra_ro SET default_transaction_read_only = on;
