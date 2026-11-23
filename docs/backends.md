# Backends: `apps/api` and `apps/ai`

```
 browser ──GraphQL──▶ apps/api (NestJS, :4000) ──REST + service JWT──▶ apps/ai (FastAPI, :8000) ──▶ Claude
                        │  Postgres (Prisma): notes              │  Postgres (SQLAlchemy): agent_runs
                        │  Mongo (Mongoose): note_summaries      │  Mongo (Beanie): transcripts
                        └  Redis: cached note lists              └  (internal only, never public)
```

|          | `apps/api`                                                           | `apps/ai`                                   |
| -------- | -------------------------------------------------------------------- | ------------------------------------------- |
| Role     | Public GraphQL API; will own auth (OAuth + JWT)                      | Internal AI service; only `api` may call it |
| Stack    | NestJS 12, Apollo Server 5, code-first GraphQL                       | FastAPI, Anthropic Python SDK               |
| Postgres | Prisma 7 (`prisma/schema.prisma`, migrations in `prisma/migrations`) | SQLAlchemy 2 + Alembic (`migrations/`)      |
| Mongo    | Mongoose (`note_summaries`)                                          | Beanie (`transcripts`)                      |
| Redis    | Cache for note lists (60 s, cleared on every change)                 | —                                           |
| Tests    | Jest unit (`pnpm test`) + e2e against real DBs (`pnpm test:e2e`)     | Pytest (`pnpm test`), Ruff, mypy strict     |

## Run it

```bash
pnpm infra:env && pnpm infra:up
```

```bash
pnpm --filter @getsetgo/api db:deploy && pnpm --filter @getsetgo/ai db:migrate
```

```bash
pnpm dev
```

`pnpm dev` starts both services with hot reload (Turborepo runs them side by side):

- GraphQL endpoint: `http://localhost:4000/graphql` (POST, `content-type: application/json`)
- Health: `http://localhost:4000/health` and `/health/ready`
- AI service docs (development only): `http://localhost:8000/docs`

To run both services as production-like containers instead: `pnpm stack:up` (and `pnpm stack:down`).
In that mode the AI service has no published port; only the API container can reach it.

### Turning on Claude

Summaries need an Anthropic API key. Create one at https://console.anthropic.com, then set it in
`apps/ai/.env`:

```text
ANTHROPIC_API_KEY=sk-ant-...
```

Without a key everything else works; `summarizeNote` returns the error code `AI_UNAVAILABLE`.
The model (`AI_MODEL`, default `claude-opus-5-5`) and effort (`AI_EFFORT`, default `medium`) are
configurable in the same file. If a safety classifier declines a request, the API retries it on a
fallback model automatically (`fallbacks: "default"`).

## Try it

```graphql
mutation {
  createNote(
    input: { title: "Trip plan", content: "Flights to Lisbon in May, hotel near Alfama." }
  ) {
    id
  }
}
```

```graphql
mutation {
  summarizeNote(id: "<id from above>") {
    title
    summary {
      summary
      keyPoints
      model
    }
  }
}
```

```graphql
{
  notesList(page: { take: 10 }) {
    id
    title
    createdAt
    summary {
      summary
    }
  }
}
```

With curl:

```bash
curl -s localhost:4000/graphql -H 'content-type: application/json' -d '{"query":"{ notesList { id title } }"}'
```

## Security built in (constitution principle III)

| Concern                | What the code does                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access control (A01)   | Global `DenyByDefaultGuard`: resolvers must be marked `@Public()` or (after the auth spec) authenticated. `ai` requires a 60-second HS256 service JWT with pinned issuer and audience. |
| Injection (A03)        | Prisma/Mongoose/SQLAlchemy only; every input validated (class-validator, Pydantic); IDs must be UUIDs; unknown fields rejected.                                                        |
| Insecure design (A04)  | GraphQL depth limit (8), rate limit (120 requests per minute per IP), 100 kB body limit, note size limit, prompt-injection guard in the summarizer prompt.                             |
| Misconfiguration (A05) | Strict CSP and security headers (Helmet); CORS limited to the two web apps; introspection, API docs and stack traces disabled in production; unexpected errors masked.                 |
| CSRF                   | Apollo `csrfPrevention`: simple form/GET requests are rejected.                                                                                                                        |
| Logging (A09)          | Structured JSON logs; `authorization` and `cookie` headers redacted; the `X-Request-ID` flows browser → api → ai and is stored on each AI run.                                         |

## Changing things

- **New GraphQL field or type:** edit the classes in `apps/api/src/**/*.models.ts`. In development the
  schema is regenerated into `apps/api/schema.graphql` on startup (the frontends will use it).
- **Postgres schema (api):** edit `prisma/schema.prisma`, then `pnpm --filter @getsetgo/api db:migrate`.
- **Postgres schema (ai):** edit `app/db/postgres.py`, then
  `cd apps/ai && uv run alembic revision --autogenerate -m "describe change"` and `pnpm --filter @getsetgo/ai db:migrate`.
- **AI API contract:** after changing FastAPI request or response models, run
  `pnpm --filter @getsetgo/ai openapi` and `pnpm --filter @getsetgo/api ai:types` so `api` gets the new types.

## Notes on versions

- **Node 24** is required: NestJS 12 ships as ES modules only, and Jest can load those only on
  Node 24.9+ with `--experimental-vm-modules` (already in the `test` scripts).
- The api keeps CommonJS output; Node 24 loads NestJS's ES modules from it natively.
