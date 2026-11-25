# Implementation Plan: Sign-in with Google or GitHub (private notes)

**Branch**: `001-oauth-login` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-oauth-login/spec.md`

## Summary

Notes become private. `apps/api` gains an `auth` module that runs OAuth 2.0 Authorization Code +
PKCE + `state` against Google (OpenID Connect, `id_token` verified) and GitHub, using **arctic**
for the provider protocol and **jose** for JWTs. Only allowlisted identities get an account. A
session is a row in Postgres with a rotating, hashed refresh token (reuse ⇒ the whole session
family is revoked) plus a 15-minute access JWT; both live in `httpOnly; Secure; SameSite=Lax`
`__Host-` cookies that the API sets **through each web app's same-origin `/api/*` rewrite**, so
they are first-party. The callback URL is also on the web app's origin.

The global `DenyByDefaultGuard` starts accepting a valid access cookie, notes get an `ownerId`, and
every note query is scoped to the caller. Ownerless notes (with their summaries) are deleted at
release. The AI service stops storing note text in its transcripts. Both web apps get a sign-in
page, a header user menu (sign out / sign out everywhere / account), and an account page with
delete. Their `proxy.ts` redirects signed-out visitors and renews sessions server-side. Tests use a
test-only, in-process OAuth provider that can't be enabled in production.

## Technical Context

**Language/Version**: TypeScript 6.0 on Node 24 (api, web apps, packages); Python 3.13 (ai, small change)

**Primary Dependencies**:

- New in `apps/api`:
  - `arctic` 3.7: OAuth clients, PKCE, state.
  - `jose` 6: sign and verify the access JWT, verify Google's `id_token` via JWKS.
  - `cookie-parser`: read request cookies.
- Existing: NestJS 12, Apollo, Prisma 7, Mongoose, ioredis, `@nestjs/throttler`, nestjs-pino.
- Web apps: no new runtime dependencies. reCAPTCHA v3 is loaded with `next/script` and a nonce.

**Storage**:

- Postgres (Prisma): `users`, `provider_accounts`, `sessions`, `refresh_tokens`, and `notes.owner_id`.
- Redis: pending sign-ins (keyed by `state`, single use, 10 min); test-provider codes.
- MongoDB: `note_summaries` gains `ownerId`.
- ai Mongo `transcripts`: stops storing text.

**Testing**:

- Jest unit tests and API e2e tests against real databases.
- Vitest + Testing Library for the web apps and packages.
- Pytest for the ai change.
- Playwright + axe in `packages/e2e`: shared auth suite plus the updated notes suite, both apps.

**Target Platform**: Vercel (web), Render (api, ai), Neon, Atlas, Upstash; local Docker Compose

**Project Type**: web application (monorepo: 2 frontends, GraphQL API, internal AI service)

**Performance Goals**:

- Access-cookie check: one in-memory JWT verify and no database read per request.
- Sign-in to notes page in under 30 s, excluding time at the provider (SC-001).

**Constraints**:

- Access credential ≤ 15 min.
- Sessions slide for 30 days.
- No tokens in URLs, logs, Sentry or GA (FR-011, SC-007).
- Strict nonce CSP stays intact.
- WCAG 2.2 AA.
- No cross-site browser requests (FR-024).

**Scale/Scope**: personal/invite-only app (tens of users); 3 new pages per web app; ~10 API endpoints/operations

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below)._

| Principle                    | Gate                                                                                                                                      | Status                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Spec-Driven               | Spec approved, clarified; plan → tasks → implement                                                                                        | ✅ spec + clarifications done                                                                                                                                                                                                                                                                                            |
| II. Stack boundaries         | Auth lives in `api`; MUI/Redux/Apollo/Formik vs shadcn/Zustand/TanStack/RHF kept apart; `ai` stays internal and only accepts service JWTs | ✅ the web apps never talk to `ai`; shared code (`refreshSession`, cookie names, accessible names) goes in framework-agnostic `packages/graphql` and `packages/e2e`                                                                                                                                                      |
| III. Security (OWASP)        | A01–A10 addressed; threat model for auth                                                                                                  | ✅ see Threat model below (A01 deny-by-default + owner scoping; A02 jose/arctic, SHA-256 token hashes, no custom crypto; A04 threats listed; A05 CSP extended only when reCAPTCHA is configured; A07 PKCE/state/rotation/rate limits/reCAPTCHA v3; A09 auth events logged without secrets; A10 provider endpoints fixed) |
| IV. Accessible (WCAG 2.2 AA) | Sign-in, account, delete dialog, menu: keyboard, focus, 3.3.8 no cognitive test                                                           | ✅ invisible reCAPTCHA; native forms; error summary with `role="alert"`; axe in light/dark                                                                                                                                                                                                                               |
| V. Typed contracts           | GraphQL schema → codegen; REST auth routes documented; ai OpenAPI regenerated                                                             | ✅ [contracts/](contracts/)                                                                                                                                                                                                                                                                                              |
| VI. Tested                   | Each user story has automated tests                                                                                                       | ✅ US1/US2/US3 → API e2e + Playwright suites ([quickstart.md](quickstart.md))                                                                                                                                                                                                                                            |
| VII. Observable              | Sentry/GA unchanged and still scrubbed; structured auth logs                                                                              | ✅ callback query strings redacted from pino and Sentry                                                                                                                                                                                                                                                                  |
| VIII. Simplicity in ops      | No new infrastructure                                                                                                                     | ✅ reuses Postgres and Redis; no new services or containers; the test provider is in-process                                                                                                                                                                                                                             |

No violations → Complexity Tracking left empty.

### Threat model (A04, auth)

| Threat                                                    | Mitigation                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forged or replayed callback, authorization-code injection | `state` (32 random bytes) is bound to this browser through the `__Host-gsg_oauth` cookie and to Redis with `GETDEL`, so it's single use and lasts 10 min. A PKCE S256 verifier is kept server-side. The `redirect_uri` is fixed per web-app origin. |
| Login CSRF (attacker signs victim into attacker account)  | The state cookie has to match the callback, and the start route is a POST with an Origin check.                                                                                                                                                     |
| Token theft via XSS                                       | Cookies are `httpOnly`, and the strict nonce CSP stays. No token ever reaches JS, URLs or storage.                                                                                                                                                  |
| Stolen refresh token                                      | Rotation on every use. Reuse of a rotated token outside a 10-second race window revokes the session family and logs `auth.refresh.reuse_detected`.                                                                                                  |
| Stolen access token                                       | 15-minute lifetime, `aud`/`iss` checks, HS256 with a dedicated ≥32-byte secret (`AUTH_JWT_SECRET`, separate from `SERVICE_JWT_SECRET`).                                                                                                             |
| CSRF on state-changing requests                           | `SameSite=Lax`. GraphQL keeps Apollo `csrfPrevention`. The REST POST routes require `Origin` ∈ `CORS_ORIGINS`.                                                                                                                                      |
| IDOR on notes                                             | Every query uses `WHERE id = ? AND owner_id = ?`. Another user's note gives `NOT_FOUND`, the same error as a missing one. The Redis list cache is keyed per owner.                                                                                  |
| Account takeover via email match                          | No merging. Identity is `(provider, providerAccountId)`, and only provider-verified emails count for the allowlist.                                                                                                                                 |
| Open redirect                                             | `returnTo` must be a same-origin relative path matching `^/(?!/)`; otherwise `/`.                                                                                                                                                                   |
| Credential leakage in logs                                | pino and Sentry drop the query string of `/auth/*/callback` and never log cookies (already scrubbed). Auth events log ids only.                                                                                                                     |
| Bots / brute force                                        | reCAPTCHA v3 score ≥ `RECAPTCHA_MIN_SCORE` on start (skipped when no key is set). Throttler limits per IP: start 10/min, callback 20/min, refresh 60/min.                                                                                           |
| Test provider enabled in production                       | Enabled only when `AUTH_TEST_PROVIDER=enabled` **and** `APP_ENV` ≠ `production`. Env validation refuses to boot with both set. The Docker image defaults to `APP_ENV=production`, and `render.yaml` pins it.                                        |
| Prompt injection via note text                            | Unchanged (ai already treats note text as data). Now only the owner can trigger a summary of their own note.                                                                                                                                        |

## Project Structure

### Documentation (this feature)

```text
specs/001-oauth-login/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── auth-rest.md     # /auth/* routes (through /api/auth/* on each web app)
│   └── graphql.md       # schema additions and changes
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/schema.prisma                     # + User, ProviderAccount, Session, RefreshToken; Note.ownerId
├── prisma/migrations/<ts>_auth/             # deletes ownerless notes, adds tables and owner_id
└── src/
    ├── config/env.ts                        # + APP_ENV, AUTH_*, GOOGLE_*, GITHUB_*, RECAPTCHA_*
    ├── auth/
    │   ├── auth.module.ts
    │   ├── auth.controller.ts               # REST: providers, start, callback, refresh, sign-out
    │   ├── auth.resolver.ts                 # GraphQL: me, signOutEverywhere, deleteAccount
    │   ├── cookies.ts                       # names, attributes, set/clear helpers
    │   ├── tokens.service.ts                # access JWT (jose), refresh token create/rotate/hash
    │   ├── sessions.service.ts              # create, rotate with reuse detection, revoke
    │   ├── allowlist.ts                     # parse AUTH_ALLOWLIST, match identities
    │   ├── recaptcha.service.ts             # siteverify (skipped without a secret)
    │   ├── origin.guard.ts                  # Origin ∈ CORS_ORIGINS for POST routes
    │   ├── current-user.decorator.ts
    │   ├── account.service.ts               # delete account (Mongo summaries, then Postgres)
    │   └── providers/
    │       ├── provider.ts                  # OAuthProvider interface → ProviderIdentity
    │       ├── google.provider.ts           # arctic Google + jose id_token verification
    │       ├── github.provider.ts           # arctic OAuth2Client with PKCE + /user, /user/emails
    │       └── test.provider.ts             # in-process stand-in (+ HTML authorize form)
    ├── security/deny-by-default.guard.ts    # accepts a valid access cookie → req.user
    ├── notes/*                              # owner-scoped service, resolver, cache keys; summaries get ownerId
    └── main.ts                              # cookie-parser; pino callback-URL redaction
apps/api/test/auth.e2e-spec.ts, notes.e2e-spec.ts  # flows, rotation, reuse, IDOR, deletion

apps/ai/app/agents|routers|db/mongo.py       # transcripts keep sizes and metadata only; startup purge of old text

apps/web-material/src/ and apps/web-shadcn/src/
├── proxy.ts                                 # + redirect signed-out visitors, server-side renewal
├── app/sign-in/page.tsx                     # provider buttons, errors, reCAPTCHA
├── app/account/page.tsx                     # details + delete dialog
├── components/user-menu.tsx                 # header: name, provider, sign out (everywhere), account
├── components/recaptcha-script.tsx
└── lib/session.server.ts                    # forward auth cookies on SSR fetches; load viewer
next.config.ts (both)                        # + /api/auth/:path* rewrite

packages/graphql/src/operations/auth.graphql # Me, SignOutEverywhere, DeleteAccount
packages/graphql/src/session.ts              # refreshSession() single-flight, AUTH_COOKIES, withSessionRetry
packages/web-security/src/csp.ts             # recaptchaCspSources(siteKey)
packages/e2e/src/auth.ts, auth-suite.ts      # signIn(page, login) via test provider; US1–US3 tests
packages/e2e/src/notes-suite.ts              # runs signed in

docker-compose.yml, scripts/setup-env.mjs, .env.example files, render.yaml, docs/*.md
```

**Structure Decision**: the existing monorepo layout. Auth is a new NestJS module inside `apps/api`
(Principle II), not a new service. Each web app keeps its own stack for the new pages. Only
framework-agnostic helpers and test code go into `packages/*`.

## Phase 0 / Phase 1 outputs

- [research.md](research.md): decisions D1–D14, with no open NEEDS CLARIFICATION.
- [data-model.md](data-model.md): entities, constraints, state transitions, migration.
- [contracts/auth-rest.md](contracts/auth-rest.md) and [contracts/graphql.md](contracts/graphql.md).
- [quickstart.md](quickstart.md): how to run it and validate each user story.

## Constitution Check: post-design

Re-checked after Phase 1. All gates still pass:

- No new infrastructure.
- The ai change keeps its boundary: it only stores less, and the OpenAPI contract is unchanged except
  for descriptions.
- reCAPTCHA adds CSP sources only when a site key is configured, and only on the sign-in page. Scripts
  still load with the nonce.
- Shared packages stay framework-agnostic.

## Complexity Tracking

_None._
