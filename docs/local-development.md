# Local development infrastructure

Everything runs in Docker, so you don't need to install Postgres, MongoDB or Redis yourself.

## Quick start

```bash
pnpm infra:env     # create .env with random local passwords (only the first time)
```

```bash
pnpm infra:up      # start Postgres, MongoDB and Redis, and wait until they're healthy
```

| Command            | What it does                                                           |
| ------------------ | ---------------------------------------------------------------------- |
| `pnpm infra:up`    | Start the databases                                                    |
| `pnpm infra:tools` | Also start the admin GUIs (pgAdmin, Mongo Express, RedisInsight)       |
| `pnpm infra:ps`    | Show what's running and whether it's healthy                           |
| `pnpm infra:logs`  | Follow container logs (Ctrl+C to stop)                                 |
| `pnpm infra:down`  | Stop everything; your data is kept                                     |
| `pnpm infra:reset` | Stop everything and **delete all local data** (fresh start)            |
| `pnpm stack:up`    | Also build and run `api` + `ai` as containers (see `docs/backends.md`) |

## What's running

| Service    | Image                | Address (from your machine) | Purpose                       |
| ---------- | -------------------- | --------------------------- | ----------------------------- |
| PostgreSQL | `postgres:18-alpine` | `localhost:5432`            | Relational data               |
| MongoDB    | `mongo:8.0`          | `localhost:27017`           | Documents (e.g. AI chat logs) |
| Redis      | `redis:8.8-alpine`   | `localhost:6379`            | Server-side cache (`api`)     |

Ports bind to `127.0.0.1` only, so other devices on your network can't reach the databases.
Change a port in `.env` (e.g. `POSTGRES_PORT=5433`) if it clashes with something already installed.

## One database and login per service

Following least privilege (OWASP A01), each backend gets its own database and its own login,
and **can't read the other service's data**:

| Service    | Postgres database / user        | Mongo database / user           | Redis    |
| ---------- | ------------------------------- | ------------------------------- | -------- |
| `apps/api` | `getsetgo_api` / `getsetgo_api` | `getsetgo_api` / `getsetgo_api` | password |
| `apps/ai`  | `getsetgo_ai` / `getsetgo_ai`   | `getsetgo_ai` / `getsetgo_ai`   | —        |

The `getsetgo_api` login may also create databases locally, because `prisma migrate dev` needs a
temporary "shadow" database. It still can't connect to the `getsetgo_ai` database.

The init scripts that create them live in `infra/postgres/init/` and `infra/mongo/init/`. They
run **only the first time** a data volume is created. If you change a password in `.env` later,
run `pnpm infra:reset` (deletes data) or change it inside the database by hand.

Connection strings for the apps. `pnpm infra:env` writes them into `apps/api/.env` and
`apps/ai/.env` for you:

```text
# apps/api
DATABASE_URL=postgresql://getsetgo_api:<API_DB_PASSWORD>@localhost:5432/getsetgo_api
MONGODB_URI=mongodb://getsetgo_api:<API_MONGO_PASSWORD>@localhost:27017/getsetgo_api?authSource=getsetgo_api
REDIS_URL=redis://:<REDIS_PASSWORD>@localhost:6379/0

# apps/ai
DATABASE_URL=postgresql+asyncpg://getsetgo_ai:<AI_DB_PASSWORD>@localhost:5432/getsetgo_ai
MONGODB_URI=mongodb://getsetgo_ai:<AI_MONGO_PASSWORD>@localhost:27017/getsetgo_ai?authSource=getsetgo_ai
```

## Admin GUIs (optional)

Start them with `pnpm infra:tools`. They need a login and are only reachable from your machine.

| Tool          | URL                   | Login                                                                                                              |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| pgAdmin       | http://localhost:5050 | `PGADMIN_EMAIL` / `PGADMIN_PASSWORD`; the server is pre-registered, enter `POSTGRES_SUPERUSER_PASSWORD` when asked |
| Mongo Express | http://localhost:8081 | `MONGO_EXPRESS_USER` / `MONGO_EXPRESS_PASSWORD`                                                                    |
| RedisInsight  | http://localhost:5540 | none; the Redis connection is pre-configured                                                                       |

All passwords are in your `.env`.

## Command-line access

```bash
docker compose exec postgres psql -U postgres
```

```bash
docker compose exec mongo mongosh -u root -p
```

```bash
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli'
```

## Troubleshooting

- **"set XYZ in .env"** when starting: run `pnpm infra:env`, or add the missing variable from `.env.example`.
- **Port already in use:** another Postgres, Mongo or Redis is running locally. Stop it or change the port in `.env`.
- **Login fails after editing `.env`:** passwords are applied only when the volume is first created. See above.
- **pgAdmin login doesn't work:** its settings volume may predate a config change. Run
  `docker compose --profile tools down` then `docker volume rm getsetgo_pgadmin-data`.

## How this maps to the cloud

| Local                | Production (Phase 6) |
| -------------------- | -------------------- |
| `postgres` container | Neon                 |
| `mongo` container    | MongoDB Atlas        |
| `redis` container    | Upstash              |

Each managed service gives you a connection string in the same format as above, so the apps
only need different environment variables. No code changes are required.
