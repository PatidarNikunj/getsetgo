# Going live: a beginner's guide to the cloud setup

Everything below uses **free tiers** and needs no server administration. Plan on an hour or two the
first time. Do the steps in order: later steps need values from earlier ones.

```
                    ┌──────────── Vercel ────────────┐
 browser ──HTTPS──▶ │ web-material   web-shadcn      │  /api/graphql is forwarded ──┐
                    └────────────────────────────────┘                              │
                    ┌──────────── Render ────────────┐                              │
                    │ getsetgo-api  ◀──────────────────────────────────────────────┘
                    │      │ service JWT              │
                    │      ▼                          │
                    │ getsetgo-ai ──▶ Claude API      │
                    └──────┬─────────────────────────┘
                           ▼
         Neon (Postgres) · MongoDB Atlas · Upstash (Redis)
```

| Service       | What it runs                              | Free tier, roughly                            | Paid upgrade                             |
| ------------- | ----------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| Vercel        | both Next.js apps, preview deploys per PR | Hobby: personal, non-commercial projects      | Pro, about $20/month                     |
| Render        | `api` and `ai` from their Dockerfiles     | sleeps after 15 min idle; ~30-60 s cold start | Starter, about $7/month per service      |
| Neon          | PostgreSQL                                | 0.5 GB, scales to zero                        | from about $19/month                     |
| MongoDB Atlas | MongoDB                                   | M0: 512 MB shared                             | dedicated clusters from about $57/month  |
| Upstash       | Redis                                     | small daily command allowance                 | pay as you go                            |
| Anthropic     | Claude summaries                          | paid per token, no free tier                  | set a monthly spend limit in the Console |

Prices and limits change; check each provider's pricing page. **Pick one region for everything**
(this guide uses Frankfurt / `eu-central-1`; any region works if they all match).

## 1. GitHub settings (5 minutes)

In the repository on GitHub → **Settings**:

1. **Code security**: turn on _Dependabot alerts_, _Dependabot security updates_, _Secret scanning_ and
   _Push protection_ (blocks pushes that contain API keys).
2. **Branches → Add rule** for `main`: require a pull request, and require the status checks
   **checks**, **e2e**, **audit** and **analyze** to pass. Now nothing reaches production without CI.
3. **Secrets and variables → Actions → New repository secret**: `ANTHROPIC_API_KEY` (only needed for the
   `@claude` GitHub bot; see step 8).

What the workflows do (`.github/workflows/`):

| Workflow         | When                      | What                                                                                                                                     |
| ---------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`         | every PR and push to main | formatting, lint, types, unit tests, builds; generated code up to date; API + browser e2e with axe in Docker; `pnpm audit` + `pip-audit` |
| `codeql.yml`     | PRs, main, weekly         | static security analysis for TypeScript, Python and the workflows themselves                                                             |
| `claude.yml`     | when you write `@claude`  | Claude Code answers in the issue or PR, and can push fixes                                                                               |
| `dependabot.yml` | weekly                    | grouped dependency updates for npm, Python, Docker and GitHub Actions                                                                    |

## 2. Neon: PostgreSQL

1. Sign up at https://neon.tech → **New project** → region _Frankfurt_ → Postgres 18.
2. Create two databases, `getsetgo_api` and `getsetgo_ai`, each with **its own role**
   (Databases → New database; Roles → New role). This is the same per-service isolation as locally.
3. Copy each connection string (Dashboard → Connect → pick the database and role):
   - api: `postgresql://getsetgo_api:…@…neon.tech/getsetgo_api?sslmode=require`
   - ai: change the scheme and the SSL flag for asyncpg:
     `postgresql+asyncpg://getsetgo_ai:…@…neon.tech/getsetgo_ai?ssl=require`

## 3. MongoDB Atlas

1. Sign up at https://www.mongodb.com/atlas → create a free **M0** cluster in the same region.
2. **Database Access → Add user** twice, each with _readWrite_ on only its database
   (`getsetgo_api`, `getsetgo_ai`). Use _Specific privileges_, not "Atlas admin".
3. **Network Access**: Render's free plan has no fixed outgoing IPs, so allow `0.0.0.0/0`. The
   database is still protected by its users, strong passwords and TLS. With a paid plan, list
   Render's outbound IPs instead.
4. **Connect → Drivers** gives `mongodb+srv://USER:PASSWORD@cluster…mongodb.net/`. Add the database
   name: `…mongodb.net/getsetgo_api?retryWrites=true&w=majority`.

## 4. Upstash: Redis

1. Sign up at https://upstash.com → **Create database** → same region, _TLS enabled_.
2. Copy the `rediss://default:…@….upstash.io:6379` URL (note the double `s` = TLS).

## 5. Render: the API and AI services

1. Sign up at https://render.com with GitHub and allow access to this repository.
2. **New → Blueprint** → select the repo. Render reads [`render.yaml`](../render.yaml) and shows both
   services plus a shared, auto-generated `SERVICE_JWT_SECRET`.
3. Fill in the values it asks for:

| Service      | Variable             | Value                                                                                  |
| ------------ | -------------------- | -------------------------------------------------------------------------------------- |
| getsetgo-api | `DATABASE_URL`       | Neon api string (step 2)                                                               |
|              | `MONGODB_URI`        | Atlas api string (step 3)                                                              |
|              | `REDIS_URL`          | Upstash URL (step 4)                                                                   |
|              | `AI_SERVICE_URL`     | `https://getsetgo-ai.onrender.com`; fill in after the first deploy if the name differs |
|              | `CORS_ORIGINS`       | your two Vercel URLs, comma-separated (step 6)                                         |
|              | `SENTRY_DSN`, `GA_*` | optional, see [observability](observability.md)                                        |
| getsetgo-ai  | `DATABASE_URL`       | Neon ai string with `postgresql+asyncpg://…?ssl=require`                               |
|              | `MONGODB_URI`        | Atlas ai string                                                                        |
|              | `ANTHROPIC_API_KEY`  | from https://console.anthropic.com (optional: without it, summaries say "unavailable") |

4. **Apply**. Migrations run automatically when each container starts. Check
   `https://getsetgo-api.onrender.com/health/ready`: everything should say `"up"`.

From now on, every merge to `main` redeploys after CI passes (`autoDeployTrigger: checksPass`), and only
the service whose files changed (`buildFilter`).

## 6. Vercel: the two web apps

Create **two projects** from the same repository:

1. https://vercel.com → **Add New → Project** → import the repo.
2. **Root Directory**: `apps/web-material` (then repeat for `apps/web-shadcn`). Vercel detects Next.js
   and pnpm; each app's `vercel.json` sets the build and skips deploys when that app didn't change
   (`turbo-ignore`).
3. **Environment variables** (Production and Preview):

| Variable                                                  | Value                               |
| --------------------------------------------------------- | ----------------------------------- |
| `API_URL`                                                 | `https://getsetgo-api.onrender.com` |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` | optional                            |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`       | optional, for readable stack traces |

4. **Deploy**. Then put both production URLs into the API's `CORS_ORIGINS` on Render.
5. Optional: Project → **Analytics** and **Speed Insights** → Enable (cookieless, already wired in).

Every pull request now gets its own preview URL for both apps.

> **Free-plan cold starts:** when the API has been asleep, the first page load can take ~30-60 seconds,
> and Vercel may time out while waiting. Reload once it's awake, or upgrade the API to Render Starter.

## 7. Check that it works

- Open both Vercel URLs: the cookie banner appears, notes load, and creating a note works.
- **Summarize** works if the Anthropic key is set.
- Response headers include a `content-security-policy` with a nonce (DevTools → Network).
- Optional, with Sentry configured: throw a test error from the browser console with
  `setTimeout(() => { throw new Error("test") })` and look for it in Sentry.

## 8. The @claude bot

With the `ANTHROPIC_API_KEY` secret set (step 1), write `@claude` in any issue or PR comment, for
example _"@claude review this PR against the constitution"_ or _"@claude the e2e job failed, please
fix it"_. It runs only when someone with write access mentions it, and its usage is billed to your
Anthropic account.

## Costs and safety checklist

- Set a **monthly spend limit** in the Anthropic Console.
- Keep secrets only in the provider dashboards and GitHub secrets, never in the repo (push protection
  helps).
- Free tiers are for learning. Before real users: upgrade the API to an always-on plan, restrict Atlas
  network access, and add login (the planned first Spec Kit feature) so notes aren't public.

## Troubleshooting

| Symptom                                    | Likely cause                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `/health/ready` shows `"postgres": "down"` | wrong `DATABASE_URL`, or a missing `?sslmode=require` / `?ssl=require`                |
| ai fails with an SSL argument error        | the ai URL must use `?ssl=require`, not `sslmode` (asyncpg)                           |
| `"ai": "down"` on the API                  | `AI_SERVICE_URL` wrong, or the ai service is asleep (free plan)                       |
| Summaries say "unavailable"                | `ANTHROPIC_API_KEY` missing or invalid on getsetgo-ai                                 |
| Everyone shares one rate limit             | `TRUST_PROXY_HOPS` must be `2` on Render (set by the Blueprint)                       |
| Vercel build fails on install              | the root `package.json` requires Node 24: Project → Settings → Node.js Version → 24.x |
