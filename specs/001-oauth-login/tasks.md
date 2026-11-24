# Tasks: Sign-in with Google or GitHub (private notes)

**Input**: Design documents from `specs/001-oauth-login/`

**Prerequisites**:

- [plan.md](plan.md)
- [spec.md](spec.md)
- [research.md](research.md)
- [data-model.md](data-model.md)
- contracts: [auth-rest.md](contracts/auth-rest.md), [graphql.md](contracts/graphql.md)
- [quickstart.md](quickstart.md)

**Tests**: required. Constitution VI says each user story needs automated tests for its acceptance
criteria.

**Format**: `[ID] [P?] [Story] Description`. `[P]` means the task can run in parallel (different files,
no dependency on unfinished tasks).

## Phase 1: Setup

- [X] T001 Add `arctic`, `jose`, `cookie-parser` and `@types/cookie-parser` to `apps/api/package.json`
      (exact versions, respecting `minimumReleaseAge`); run `pnpm install` and check that
      `pnpm audit --prod --audit-level=high` stays clean.
- [X] T002 Extend `apps/api/src/config/env.ts` and `apps/api/src/config/env.spec.ts` with:
  - `APP_ENV` (default `production`), `AUTH_JWT_SECRET` (≥ 32), `AUTH_ALLOWLIST`
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (both or neither), `GITHUB_OAUTH_APPS` (JSON)
  - `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE`, `AUTH_TEST_PROVIDER`

  The schema refuses `AUTH_TEST_PROVIDER=enabled` together with `APP_ENV=production` (research D12).
  Variables are defined in data-model.md § Configuration.

- [X] T003 [P] Update the env files and deploy config (no real secrets):
  - `scripts/setup-env.mjs`: generate `AUTH_JWT_SECRET`; write `APP_ENV=development`,
    `AUTH_TEST_PROVIDER=enabled` and `AUTH_ALLOWLIST=test:e2e-*,test:alice,test:bob`.
  - `.env.example` files in the root, `apps/api`, `apps/web-material` and `apps/web-shadcn` (the web
    apps get `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`).
  - `docker-compose.yml`: the api service gets `APP_ENV=test` plus the test provider and allowlist.
  - `apps/api/Dockerfile`: `ENV APP_ENV=production`.
  - `render.yaml`: `APP_ENV=production`, a generated `AUTH_JWT_SECRET`, and `sync: false` entries
    for the auth secrets.
- [X] T004 [P] Add the `/api/auth/:path*` → `${apiUrl}/auth/:path*` rewrite to
      `apps/web-material/next.config.ts` and `apps/web-shadcn/next.config.ts`. Write a throwaway check
      (curl through `next dev`) that a 303 with a relative `Location` and `Set-Cookie` passes through
      unchanged (research D6). If it doesn't, switch the redirects to absolute URLs built from the
      stored origin, and record that in research.md.

## Phase 2: Foundational (blocks all stories)

- [X] T005 Add the models to `apps/api/prisma/schema.prisma`:
  - `User` (data-model.md `User.displayName`, `User.email`, `User.avatarUrl`)
  - `ProviderAccount` (`ProviderAccount.userId` unique, `ProviderAccount.provider` enum
    `AuthProvider`, `ProviderAccount.providerAccountId`, `ProviderAccount.login`,
    `ProviderAccount.email`, `@@unique([provider, providerAccountId])`)
  - `Session` (`Session.expiresAt`, `Session.revokedAt`, `Session.revokedReason` enum)
  - `RefreshToken` (`RefreshToken.tokenHash` unique char(64), `RefreshToken.usedAt`)
  - `Note.ownerId` (FK, cascade, index `(owner_id, created_at)`)

  Then create `apps/api/prisma/migrations/<ts>_auth/migration.sql` with
  `pnpm --filter @getsetgo/api db:migrate`, and hand-edit it to `DELETE FROM notes` before adding
  `owner_id NOT NULL` (data-model.md § Migration).

- [X] T006 [P] Create `apps/api/src/auth/cookies.ts`:
  - Cookie names and attributes for `__Host-gsg_at`, `__Host-gsg_rt` and `__Host-gsg_oauth`
    (research D5).
  - `setSessionCookies(res, …)`, `clearSessionCookies(res)` and `Cache-Control: no-store`.
  - Unit test `cookies.spec.ts` covering the attributes.
- [X] T007 [P] Create `apps/api/src/auth/tokens.service.ts` and its spec:
  - Sign and verify the access JWT with jose (HS256; `sub`, `sid`, `iss=getsetgo-api`,
    `aud=getsetgo-web`, 15 min).
  - Generate the 32-byte refresh token and its SHA-256 hex hash (data-model.md
    `RefreshToken.tokenHash`).
- [X] T008 Update `apps/api/src/main.ts`:
  - Register `cookie-parser`.
  - Add a pino-http `serializers.req` in `apps/api/src/app.module.ts` that strips query strings from
    `/auth/` URLs.
  - Extend `apps/api/src/observability/scrub.ts` and its spec so they drop the `code`, `state` and
    `error_description` query parameters (research D13).
- [X] T009 Update `apps/api/src/security/deny-by-default.guard.ts` and its spec: for non-public
      handlers, verify `__Host-gsg_at` through `TokensService` and set `req.user = { userId, sessionId }`;
      otherwise throw a GraphQL `UNAUTHENTICATED` error. Works for both GraphQL and HTTP contexts.
- [X] T010 [P] Create `apps/api/src/auth/current-user.decorator.ts` (`@CurrentUser()` for GraphQL and
      HTTP) and an `AuthUser` type.
- [X] T011 [P] Create `apps/api/src/auth/allowlist.ts` and its spec:
  - Parse `AUTH_ALLOWLIST`: emails, `github:<login>`, and `test:<login>` / `test:<prefix>*` (the
    wildcard is accepted only for `test:`).
  - Case-insensitive matching against verified email or login (research D8).
- [X] T012 [P] Create `apps/api/src/auth/origin.guard.ts` and its spec: POST routes require `Origin` ∈
      `CORS_ORIGINS`, else 403 (contracts/auth-rest.md, common rules).
- [X] T013 Create `apps/api/src/auth/auth.module.ts`:
  - Wires `PrismaModule`, `CacheModule` (Redis) and `ConfigModule`.
  - Registers the throttler named limits from research D14.
  - Imported in `apps/api/src/app.module.ts`.
- [X] T014 [P] Add `packages/graphql/src/operations/auth.graphql` (`Me`, `SignOutEverywhere`,
      `DeleteAccount`, per contracts/graphql.md). Add `packages/graphql/src/session.ts` with:
  - `AUTH_COOKIES` names
  - `refreshSession()`: single-flight `POST /api/auth/refresh`, resolving to a boolean
  - `isUnauthenticated(error)`

  Export them from the package index, with a Vitest spec for the single-flight behavior. Codegen
  runs after T015.

- [X] T015 Add `Viewer`, `AuthProvider` and the `me` / `signOutEverywhere` / `deleteAccount` types to a
      new `apps/api/src/auth/auth.models.ts`. Add stub resolvers in `apps/api/src/auth/auth.resolver.ts`
      (implemented in their stories) so the schema compiles, then run
      `pnpm --filter @getsetgo/graphql codegen` and commit the output in `packages/graphql/src/generated`.

**Checkpoint**: the schema migrates, the guard is enforced, and the shared helpers exist.

## Phase 3: User Story 1: Sign in and see only my notes (P1) 🎯 MVP

**Goal**: allowlisted people sign in with Google, GitHub or the test provider in either app, and
see and manage only their own notes. Others get "invite-only".

**Independent test**: quickstart scenarios 1–6; the API e2e IDOR test; the Playwright auth suite.

### Tests (write first, expect failures)

- [X] T016 [P] [US1] Create `apps/api/test/auth.e2e-spec.ts` (supertest + a cookie jar) covering:
  - The full test-provider flow: start → authorize → callback; check the cookies and a 303 to `/`.
  - State mismatch, a replayed state and a wrong PKCE verifier → `error=expired` or `failed`.
  - A non-allowlisted login → `error=invite_only` with no `users` row.
  - Provider cancel → `error=denied`.
  - A bad `Origin` → 403.
  - `returnTo=//evil` → `/`.
- [X] T017 [P] [US1] Rewrite `apps/api/test/notes.e2e-spec.ts`:
  - Signed-out operations return `UNAUTHENTICATED`.
  - Users A and B: B's `note`, `deleteNote` and `summarizeNote` on A's id behave exactly like a random
    UUID, and `notesList` is per user (SC-002).
- [X] T018 [P] [US1] Create `packages/e2e/src/auth.ts` with
      `signIn(page, login = "e2e-<random>")`, which goes through "Continue with test provider".
      Create `packages/e2e/src/auth-suite.ts` with the US1 tests:
  - redirect to `/sign-in` when signed out
  - sign in lands on empty notes
  - two users are isolated
  - invite-only message
  - cancel message
  - axe on `/sign-in` in light and dark
- [X] T019 [US1] Update `packages/e2e/src/notes-suite.ts` and `packages/e2e/src/fixtures.ts` so every
      notes test runs signed in as a fresh `e2e-*` user. Export `authSuite` from
      `packages/e2e/src/index.ts`, and call it from each app's Playwright spec
      (`apps/web-material/e2e/*`, `apps/web-shadcn/e2e/*`).

### API implementation

- [X] T020 [P] [US1] Create `apps/api/src/auth/providers/provider.ts`:
  - The `OAuthProvider` interface: `id`, `isConfiguredFor(origin)`,
    `authorizationUrl(state, verifier, redirectUri)`, `identify(code, verifier, redirectUri)`.
  - `ProviderIdentity`: `provider`, `providerAccountId`, `displayName`, `email?` (only if verified),
    `login?`, `avatarUrl?`.
- [X] T021 [P] [US1] Create `apps/api/src/auth/providers/google.provider.ts` and its spec:
  - arctic `Google`, scopes `openid email profile`.
  - Verify the `id_token` with a jose JWKS (issuer and audience, research D8).
  - Keep `email` only when `email_verified`.
- [X] T022 [P] [US1] Create `apps/api/src/auth/providers/github.provider.ts` and its spec:
  - arctic `OAuth2Client.createAuthorizationURLWithPKCE` (S256) using the per-origin client from
    `GITHUB_OAUTH_APPS`.
  - Call `/user` and `/user/emails` (primary verified email) with `User-Agent: getsetgo`.
  - Use the numeric id as `providerAccountId`.
- [X] T023 [P] [US1] Create `apps/api/src/auth/providers/test.provider.ts` and a test-only controller:
  - `GET` and `POST /auth/test/authorize`, an HTML form with no scripts (contracts/auth-rest.md, test
    provider).
  - A one-time code in Redis bound to the challenge and `redirect_uri`, with an in-process S256 check.
  - Registered only when the env allows it (research D12).
- [X] T024 [P] [US1] Create `apps/api/src/auth/recaptcha.service.ts` and its spec:
  - siteverify at the fixed URL; check the action, score and hostname.
  - Skipped when there's no secret (research D9).
- [X] T025 [US1] Create `apps/api/src/auth/sessions.service.ts`:
  - `createSession(userId)` inserts a Session and its first RefreshToken, sets data-model.md
    `Session.expiresAt`, and returns the raw tokens.
  - `signIn(identity)` upserts the User and ProviderAccount on `(provider, providerAccountId)`, with
    no email merging (data-model.md `ProviderAccount.userId` is unique). It updates
    `ProviderAccount.lastSignInAt` and the profile fields.
- [X] T026 [US1] Create `apps/api/src/auth/auth.controller.ts` with `GET /auth/providers`,
      `POST /auth/:provider/start` and `GET /auth/:provider/callback`, exactly as in
      contracts/auth-rest.md:
  - pending sign-in in Redis via `GETDEL` (research D7)
  - the error-code redirects
  - allowlist check before any write
  - log events `auth.sign_in.succeeded` / `.failed` with ids only (research D13)
- [X] T027 [US1] Make `apps/api/src/notes/notes.service.ts`, `notes.resolver.ts` and
      `note-summary.schema.ts` owner-scoped:
  - Remove `@Public()` and use `@CurrentUser()`.
  - Every query filters by `id` and data-model.md `Note.ownerId`.
  - Cache keys become `notes:list:<ownerId>:…`.
  - Summaries store data-model.md `NoteSummary.ownerId`.
  - Add an `onApplicationBootstrap` purge of summaries without an `ownerId`.
  - Update `notes.service.spec.ts`.
- [X] T028 [US1] Implement `me` in `apps/api/src/auth/auth.resolver.ts`, returning a `Viewer` built
      from `User` and `ProviderAccount`.

### AI service (research D2)

- [X] T029 [P] [US1] Update `apps/ai/app/routers/summaries.py` and `apps/ai/app/db/mongo.py`:
  - Transcripts store `{note_id, title_chars, content_chars}` and `{summary_chars, model}` only.
  - Add an idempotent startup `$unset` of the old text fields in the lifespan (`apps/ai/app/main.py`).
  - Update the tests in `apps/ai/tests/`.
  - Regenerate `apps/ai/openapi.json` and `apps/api/src/ai/ai-api.d.ts` if anything changed.

### Web apps

- [X] T030 [P] [US1] Add `recaptchaCspSources(siteKey)` to `packages/web-security/src/` (with a spec),
      and use it in both `proxy.ts` files for `/sign-in` only when
      `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is set.
- [X] T031 [US1] Update `apps/web-shadcn/src/proxy.ts` and `apps/web-material/src/proxy.ts` per
      research D10:
  - signed-out redirect to `/sign-in?returnTo=`
  - server-side renewal through `POST ${API_URL}/auth/refresh`, copying `Set-Cookie` to the response
    and the request
  - `/sign-in` → `/` when already signed in
  - `Cache-Control: no-store` on protected pages

  Shared, framework-agnostic logic (cookie parsing, the decoded-`exp` check) goes in
  `packages/web-security/src/session.ts`, with a spec.

- [X] T032 [P] [US1] Create `apps/web-shadcn/src/lib/session.server.ts`: forward only the auth cookies
      to API_URL, and add `getViewer()`. Update `apps/web-shadcn/src/lib/notes.server.ts` and
      `apps/web-shadcn/src/lib/notes.ts` so calls go through `refreshSession()` and retry once on
      `UNAUTHENTICATED`, then send the user to `/sign-in`.
- [X] T033 [P] [US1] Create `apps/web-material/src/lib/session.server.ts`, update
      `apps/web-material/src/lib/apollo.server.ts` to forward the auth cookies, and add an Apollo
      `ErrorLink` in `apps/web-material/src/app/providers.tsx` that renews once and retries on
      `UNAUTHENTICATED`.
- [X] T034 [P] [US1] Create `apps/web-shadcn/src/app/sign-in/page.tsx` and
      `apps/web-shadcn/src/components/sign-in-buttons.tsx`, built with shadcn and Tailwind:
  - One native POST form per provider from `GET /api/auth/providers`, with a hidden `returnTo`.
  - The reCAPTCHA token is added on submit via `components/recaptcha-script.tsx` (nonce).
  - An error region with `role="alert"` maps the error codes to plain text.
  - The reCAPTCHA notice.
  - Accessible names per contracts/graphql.md.
  - A component test.
- [X] T035 [P] [US1] Create `apps/web-material/src/app/sign-in/page.tsx` and
      `apps/web-material/src/components/sign-in-buttons.tsx`, the same as T034 with MUI components.
- [X] T036 [US1] Show the notes page only for signed-in users in both apps:
  - `apps/web-shadcn/src/app/page.tsx` and `apps/web-material/src/app/page.tsx` read the viewer.
  - Add a minimal header with the display name and provider: `components/user-menu.tsx` in each
    app; its menu items come in US2.

**Checkpoint**: US1 is fully usable and testable. This is the MVP.

## Phase 4: User Story 2: Stay signed in, sign out, sign out everywhere (P2)

**Goal**: sliding 30-day sessions, rotation with reuse detection, sign out, and sign out everywhere.

**Independent test**: quickstart scenarios 7–10; API e2e rotation and reuse; the Playwright US2 tests.

### Tests

- [X] T037 [P] [US2] Add API e2e tests to `apps/api/test/auth.e2e-spec.ts`:
  - refresh rotates both cookies and slides data-model.md `Session.expiresAt`
  - reuse after 10 s revokes the session (`Session.revokedReason = REUSE`); a reuse within 10 s
    doesn't
  - an expired session → 401
  - allowlist removal → 401 at refresh
  - sign-out revokes and clears cookies
  - `signOutEverywhere` revokes all of the user's sessions

  Use fake timers or direct DB time shifts.

- [X] T038 [P] [US2] Unit-test the renewal state table (data-model.md § RefreshToken) in
      `apps/api/src/auth/sessions.service.spec.ts`.
- [X] T039 [P] [US2] Add US2 tests to `packages/e2e/src/auth-suite.ts`:
  - deleting the access cookie and reloading keeps you signed in
  - sign out followed by Back doesn't show notes
  - sign out everywhere in context A logs out context B after its access cookie is removed
  - the header shows the name and provider
  - axe on the open menu

### Implementation

- [X] T040 [US2] Implement `rotate(rawToken)` and `revoke(sessionId, reason)` /
      `revokeAll(userId, reason)` in `apps/api/src/auth/sessions.service.ts`:
  - an atomic `UPDATE … WHERE used_at IS NULL`
  - the 10 s race window
  - an allowlist re-check using `ProviderAccount.email` / `ProviderAccount.login`
  - log `auth.refresh.reuse_detected`
  - a startup sweep of long-expired sessions (data-model.md `RefreshToken.usedAt`, `Session.revokedAt`)
- [X] T041 [US2] Add `POST /auth/refresh` and `POST /auth/sign-out` to
      `apps/api/src/auth/auth.controller.ts` per contracts/auth-rest.md (Origin guard, throttling,
      HTML vs `fetch` responses).
- [X] T042 [US2] Implement `signOutEverywhere` in `apps/api/src/auth/auth.resolver.ts`: revoke all
      sessions and clear cookies on the GraphQL response.
- [X] T043 [P] [US2] Build the full user menu in `apps/web-shadcn/src/components/user-menu.tsx` (shadcn
      DropdownMenu, added via the shadcn CLI as `components/ui/dropdown-menu.tsx`):
  - "Account" link
  - "Sign out" (native form post)
  - "Sign out everywhere" (TanStack mutation, then `queryClient.clear()` and navigation to
    `/sign-in?signedOut=1`)
  - an announced status
- [X] T044 [P] [US2] Build the full user menu in `apps/web-material/src/components/user-menu.tsx` (MUI
      Menu), the same as T043 using an Apollo mutation and `client.clearStore()`; the Redux UI slice
      shows the snackbar.
- [X] T045 [US2] Show the "signed out" status message on both sign-in pages (`?signedOut=1`), in a
      polite live region.

**Checkpoint**: US1 and US2 both work independently.

## Phase 5: User Story 3: See and delete my account (P3)

**Goal**: an account page with details, and permanent deletion of everything.

**Independent test**: quickstart scenario 11; API e2e deletion (Postgres and Mongo); the Playwright
US3 tests.

### Tests

- [X] T046 [P] [US3] Add API e2e tests to `apps/api/test/auth.e2e-spec.ts`: after `deleteAccount`,
      the user's notes, Mongo summaries (by data-model.md `NoteSummary.ownerId`), sessions and tokens
      are gone; the cookies are cleared; signing in again with the same identity gives a new user id
      with no notes (SC-005).
- [X] T047 [P] [US3] Add US3 tests to `packages/e2e/src/auth-suite.ts`: the account page shows the
      details; the delete dialog has keyboard flow and focus return; Cancel keeps the account;
      confirming signs out with a message; signing in again gives empty notes; axe on the account
      page and the dialog in light and dark.

### Implementation

- [X] T048 [US3] Create `apps/api/src/auth/account.service.ts` and implement `deleteAccount` in
      `auth.resolver.ts`, in research D11 order:
  1. revoke all sessions
  2. Mongo `deleteMany({ownerId})`
  3. Prisma delete of the user (cascade)
  4. invalidate the owner's cache
  5. clear cookies
  6. log `auth.account.deleted`
- [X] T049 [P] [US3] Create `apps/web-shadcn/src/app/account/page.tsx` and
      `components/delete-account-dialog.tsx`:
  - shadcn Card and AlertDialog
  - TanStack mutation, then navigate to `/sign-in?deleted=1`
  - fields from contracts/graphql.md `Viewer`; the login is shown when there's no email
- [X] T050 [P] [US3] Create `apps/web-material/src/app/account/page.tsx` and
      `components/delete-account-dialog.tsx`, the same as T049 with an MUI Dialog
      (`role="alertdialog"`) and an Apollo mutation.
- [X] T051 [US3] Show the "account deleted" message on both sign-in pages (`?deleted=1`).

**Checkpoint**: all stories work.

## Phase 6: Polish and cross-cutting

- [X] T052 [P] Write the docs:
  - `docs/backends.md`: the auth module, Google and GitHub OAuth app setup (two GitHub apps), the
    allowlist, the test provider.
  - `docs/frontends.md`: the sign-in flow, renewal, nonce for reCAPTCHA.
  - `docs/observability.md`: the reCAPTCHA privacy note, redaction.
  - `docs/cloud.md`: the new Render/Vercel variables and callback URLs; drop the "add login"
    caveat.
  - `docs/local-development.md`
  - `README.md` roadmap
- [X] T053 [P] Update `CLAUDE.md` conventions: notes are owner-scoped, there are no public resolvers
      anymore, and the test provider can't run in production.
- [X] T054 Privacy check (SC-007): run the e2e suites with the local Sentry/GA stand-ins and
      `LOG_LEVEL=debug`; grep the logs and captured payloads for cookie values, `code=`, emails and
      note text, and expect none.
- [X] T055 Run everything from quickstart.md:
  - `pnpm format:check` and `pnpm turbo run lint typecheck test build`
  - the codegen freshness diff
  - API e2e
  - `pnpm test:e2e` for both apps
  - the Docker stack health check

  Then do a manual keyboard pass in light and dark.

- [X] T056 Commit in Conventional Commit slices on `001-oauth-login`, push, and open the PR when
      asked. The PR body links the spec, warns that deploying deletes existing notes, and lists the
      env vars to set first.

## Dependencies and execution order

- **Setup (T001–T004)** has no prerequisites. T003 and T004 can run in parallel with T001 and T002.
- **Foundational (T005–T015)** depends on Setup:
  - T005 comes before T025 and T027.
  - T007 comes before T009.
  - T015 comes before any web codegen use.
- **US1 (T016–T036)** depends on Foundational. It's the MVP.
- **US2 (T037–T045)** depends on Foundational and uses US1's sign-in for tests. T040 extends T025.
- **US3 (T046–T051)** depends on Foundational and US1 (`me`, the sign-in pages for messages).
- **Polish (T052–T056)** comes after the stories that are in scope.

Within a story: tests first (they fail), then providers and services, then the controller and
resolver, then the web apps. The shadcn and material tasks are always `[P]` with each other.

## Parallel examples

- **US1 tests**: T016, T017 and T018 together.
- **US1 providers**: T020 first, then T021, T022, T023 and T024 together.
- **US1 web**: T032 with T033, and T034 with T035, all in parallel once T031 is done.
- **US2**: T037, T038 and T039 together; then T043 with T044.
- **US3**: T046 with T047; T049 with T050.

## Implementation strategy

1. **MVP**: Setup, Foundational and US1. Validate with quickstart scenarios 1–6 and the suites.
   That's already deployable: notes are private.
2. **US2**: sessions become pleasant and revocable.
3. **US3**: right to erasure.
4. **Polish**: docs and the privacy and full-suite verification, then the PR.
