#!/usr/bin/env bash
# Runs once, the first time the Postgres volume is created.
# Creates one database + one login per service, each limited to its own database
# (least privilege, OWASP A01). Values come from docker-compose.yml / .env.
set -euo pipefail

create_service_db() {
  local db="$1" user="$2" password="$3"
  echo "Creating database '${db}' owned by '${user}'"
  # psql variables (:'name' / :"name") quote values safely, so passwords can't inject SQL.
  psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" --dbname postgres \
    -v db="$db" -v user="$user" -v password="$password" <<'SQL'
CREATE ROLE :"user" LOGIN PASSWORD :'password';
CREATE DATABASE :"db" OWNER :"user";
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"user";
SQL
  # Only the owner may create objects in the public schema.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -v user="$user" <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"user";
SQL
}

create_service_db "$API_DB_NAME" "$API_DB_USER" "$API_DB_PASSWORD"
create_service_db "$AI_DB_NAME" "$AI_DB_USER" "$AI_DB_PASSWORD"

# Local development only: `prisma migrate dev` (apps/api) needs to create a temporary
# "shadow" database to validate migrations. Production (Neon) never uses this script.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v user="$API_DB_USER" <<'SQL'
ALTER ROLE :"user" CREATEDB;
SQL

# The default 'postgres' database stays reachable only by the superuser.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -c "REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;"
