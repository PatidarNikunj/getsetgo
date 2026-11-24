# Backends: `apps/api` and `apps/ai`

```
 browser ──GraphQL──▶ apps/api (NestJS, :4000) ──REST + service JWT──▶ apps/ai (FastAPI, :8000) ──▶ Claude
                        │  Postgres (Prisma): users, sessions,   │  Postgres (SQLAlchemy): agent_runs
                        │    notes (owned by a user)             │  Mongo (Beanie): transcripts (sizes only)
                        │  Mongo (Mongoose): note_summaries      └  (internal only, never public)
                        └  Redis: note lists, sign-in state
```

|          | `apps/api`                                                           | `apps/ai`                                   |
| -------- | -------------------------------------------------------------------- | ------------------------------------------- |
| Role     | Public GraphQL API; owns sign-in (OAuth + JWT sessions)              | Internal AI service; only `api` may call it |
| Stack    | NestJS 12, Apollo Server 5, code-first GraphQL                       | FastAPI, Anthropic Python SDK               |
| Postgres | Prisma 7 (`prisma/schema.prisma`, migrations in `prisma/migrations`) | SQLAlchemy 2 + Alembic (`migrations/`)      |
| Mongo    | Mongoose (`note_summaries`)                                          | Beanie (`transcripts`)                      |
| Redis    | Per-user note-list cache (60 s, versioned); pending sign-ins         | —                                           |
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

## Sign-in (specs/001-oauth-login)

Notes are private: every GraphQL operation needs a signed-in user and only sees that user's notes
(another user's note answers `NOT_FOUND`, exactly like a missing one). The `auth` module in
`apps/api/src/auth/` does the rest:

```
 browser ── POST /api/auth/google/start ──▶ web app rewrite ──▶ api: state + PKCE, 303 to Google
 Google  ── /api/auth/google/callback?code&state ──▶ api: checks state cookie (single use, Redis),
            exchanges the code (PKCE), verifies the id_token, checks the allowlist,
            sets __Host-gsg_at (15-min JWT) + __Host-gsg_rt (rotating refresh token), 303 to /
```

- **Libraries:** [arctic](https://arcticjs.dev) for the OAuth flow (Google, and GitHub through its
  generic client so it gets PKCE too), [jose](https://github.com/panva/jose) for JWTs and Google's
  `id_token`.
- **Cookies** are `httpOnly; Secure; SameSite=Lax; Path=/` with the `__Host-` prefix. The API sets them
  on responses that pass through each web app's `/api/*` rewrite, so they're first-party to that app:
  each web app has its own sessions.
- **Sessions** (`sessions`, `refresh_tokens` tables): the access JWT lives 15 minutes; renewing
  (`POST /auth/refresh`) swaps the refresh token for a new one and extends the session by 30 days.
  Presenting an already-used refresh token (outside a 10-second window for parallel tabs) ends the
  session: someone has a copy. Only SHA-256 hashes of refresh tokens are stored.
- **Allowlist** (`AUTH_ALLOWLIST`): comma-separated verified emails (`ada@example.com`), GitHub logins
  (`github:octocat`) and test logins (`test:alice`, `test:e2e-*`). It's checked at sign-in and at every
  renewal, so removing someone takes effect within 15 minutes. Accounts are never merged by email.
- **CSRF:** `SameSite=Lax`, Apollo's CSRF prevention for GraphQL, and an `Origin` check on the REST
  POST routes. **Bots:** reCAPTCHA v3 on sign-in start when `RECAPTCHA_SECRET_KEY` is set.
- **Delete account** removes the user's summaries (Mongo), then the user; notes, sessions and tokens
  cascade. The AI service stores only sizes, never note text, so nothing is left there.
- **Release:** the auth migration deletes every pre-existing (ownerless) note, and the API deletes
  ownerless summaries when it starts.

Contracts: [`specs/001-oauth-login/contracts/`](../specs/001-oauth-login/contracts/).

### The test provider (local and e2e only)

`AUTH_TEST_PROVIDER=enabled` adds a "Continue with test provider" button. It speaks the same OAuth +
PKCE flow through a plain form served by the API, so you can sign in as anyone on the allowlist (`alice`,
`bob`, `e2e-…`) without a Google or GitHub account. It can never run in production: the API refuses to
start with it while `APP_ENV=production`, and the Docker image and `render.yaml` set `APP_ENV=production`.
`pnpm infra:env` turns it on for local development.

### Setting up Google and GitHub

- **Google:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create
  credentials → OAuth client ID → Web application. Authorized redirect URIs: one per web app, e.g.
  `http://localhost:3000/api/auth/google/callback` and `http://localhost:3001/api/auth/google/callback`
  (plus the Vercel URLs in production). Put the ID and secret in `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`.
- **GitHub:** OAuth apps allow only one callback URL, so create **one OAuth app per web app**
  ([GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)), with
  callback `<web app origin>/api/auth/github/callback`. Then set:

  ```bash
  GITHUB_OAUTH_APPS={"http://localhost:3000":{"clientId":"…","clientSecret":"…"},"http://localhost:3001":{"clientId":"…","clientSecret":"…"}}
  ```

- **reCAPTCHA v3 (optional):** [admin console](https://www.google.com/recaptcha/admin) → v3, add your
  domains (and `localhost`). The site key goes in each web app's `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, the
  secret in the API's `RECAPTCHA_SECRET_KEY`.

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
