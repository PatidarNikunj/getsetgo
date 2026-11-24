# Data model: 001-oauth-login

All new tables are in the api's Postgres database (`getsetgo_api`) via Prisma, with snake_case
mapping like the existing `notes` table. Timestamps are `timestamptz(3)`.

## User (`users`)

| Field       | Type           | Rules                                                  |
| ----------- | -------------- | ------------------------------------------------------ |
| id          | uuid PK        | `uuid()`                                               |
| displayName | varchar(200)   | provider name, falling back to the login               |
| email       | varchar(320)?  | only if provider-verified; display only (FR-021)       |
| avatarUrl   | varchar(2048)? | `https://` only (validated); not fetched by the server |
| createdAt   | timestamptz    | default now                                            |
| updatedAt   | timestamptz    | `@updatedAt`                                           |

Relations: 1–1 `ProviderAccount`, 1–n `Session`, 1–n `Note`. Deleting a user cascades to all of them.

## ProviderAccount (`provider_accounts`)

| Field             | Type                                             | Rules                                                 |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------- |
| id                | uuid PK                                          |                                                       |
| userId            | uuid FK → users, **unique**                      | one per user: no merging (FR-003)                     |
| provider          | enum `AuthProvider` (`GOOGLE`, `GITHUB`, `TEST`) |                                                       |
| providerAccountId | varchar(255)                                     | Google `sub` / GitHub numeric `id` / test login       |
| login             | varchar(100)?                                    | GitHub/test login, used by the allowlist              |
| email             | varchar(320)?                                    | verified email at last sign-in, used by the allowlist |
| lastSignInAt      | timestamptz                                      |                                                       |
| createdAt         | timestamptz                                      |                                                       |

Constraint: `@@unique([provider, providerAccountId])`. Sign-in upserts on it (FR-002).

## Session (`sessions`)

| Field         | Type                                                          | Rules                           |
| ------------- | ------------------------------------------------------------- | ------------------------------- |
| id            | uuid PK                                                       | also the access JWT `sid` claim |
| userId        | uuid FK                                                       | cascade                         |
| createdAt     | timestamptz                                                   |                                 |
| lastUsedAt    | timestamptz                                                   | updated on each renewal         |
| expiresAt     | timestamptz                                                   | `lastUsedAt + 30 days` (FR-008) |
| revokedAt     | timestamptz?                                                  |                                 |
| revokedReason | enum? `SIGN_OUT`, `SIGN_OUT_EVERYWHERE`, `REUSE`, `ALLOWLIST` |                                 |

Index: `(userId)`. A session is **active** when `revokedAt IS NULL AND expiresAt > now()`.

```
           sign-in                     refresh (valid, unused token)
 (none) ───────────▶ ACTIVE ◀──────────────────────────────┐
                       │ ├─────────────────────────────────┘
                       │ │ sign-out / sign-out-everywhere / reuse detected / allowlist removal
                       │ ▼
                       │ REVOKED (terminal)
                       │ 30 days without renewal
                       ▼
                    EXPIRED (terminal, computed)
```

## RefreshToken (`refresh_tokens`)

| Field     | Type                | Rules                                                           |
| --------- | ------------------- | --------------------------------------------------------------- |
| id        | uuid PK             |                                                                 |
| sessionId | uuid FK → sessions  | cascade; the session is the token **family**                    |
| tokenHash | char(64) **unique** | hex SHA-256 of the 32-byte random token; never the token itself |
| createdAt | timestamptz         |                                                                 |
| usedAt    | timestamptz?        | set when exchanged for a successor                              |

Renewal with a presented token `T`:

| T's state                      | Session         | Result                                                               |
| ------------------------------ | --------------- | -------------------------------------------------------------------- |
| unknown hash                   | –               | 401, clear cookies                                                   |
| `usedAt IS NULL`               | active          | set `usedAt`, insert successor, slide `expiresAt`, new access JWT    |
| `usedAt` within the last 10 s  | active          | insert another successor (benign race), no revocation                |
| `usedAt` older than 10 s       | active          | **revoke session (`REUSE`)**, log `auth.refresh.reuse_detected`, 401 |
| any                            | revoked/expired | 401, clear cookies                                                   |
| identity no longer allowlisted | active          | revoke (`ALLOWLIST`), 401                                            |

The check-and-set runs in a single transaction (`UPDATE … SET used_at = now() WHERE id = ? AND used_at
IS NULL` returning the row count) to avoid double use under concurrency. Used tokens older than the
session are deleted when the session ends; expired sessions are deleted by a startup sweep (older than
30 days past expiry).

## Note (`notes`): changed

| Field   | Change                                                   |
| ------- | -------------------------------------------------------- |
| ownerId | **new** `uuid NOT NULL`, FK → users, `ON DELETE CASCADE` |
| index   | `(owner_id, created_at)` replaces `(created_at)`         |

Every service method takes `ownerId`. Reads and deletes filter on `id AND ownerId`; a miss is
`NOT_FOUND` (FR-014).

## NoteSummary (Mongo `note_summaries`): changed

- Gains `ownerId: string` (indexed).
- Startup purge: `deleteMany({ ownerId: { $exists: false } })` (FR-019).
- Account deletion: `deleteMany({ ownerId })`.

## AI transcript (ai Mongo `transcripts`): changed

- `input` → `{ note_id, title_chars, content_chars }`.
- `output` → `{ summary_chars, model }`.
- No text.
- Startup purge `$unset`s the text fields from older documents (D2).

## Migration (`prisma/migrations/<ts>_auth/migration.sql`)

1. Create the `AuthProvider` and `SessionRevokedReason` enums, then `users`, `provider_accounts`,
   `sessions` and `refresh_tokens`.
2. `DELETE FROM notes;`: pre-feature notes have no owner (FR-019, a deliberate data loss confirmed in
   the clarifications).
3. `ALTER TABLE notes ADD COLUMN owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE;`
   Then swap the index.

The Mongo purges run at api/ai startup, so they're idempotent and happen on every environment,
including Render.

## Configuration (api `env.ts`)

| Variable                  | Required             | Notes                                                                                                                                                                             |
| ------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                 | default `production` | `development` \| `test` \| `production`                                                                                                                                           |
| `AUTH_JWT_SECRET`         | yes                  | ≥ 32 chars                                                                                                                                                                        |
| `AUTH_ALLOWLIST`          | yes (may be empty)   | see research D8; an empty list means nobody can sign in                                                                                                                           |
| `GOOGLE_CLIENT_ID/SECRET` | optional, as a pair  | provider hidden when unset                                                                                                                                                        |
| `GITHUB_OAUTH_APPS`       | optional             | JSON `{"<web origin>": {"clientId": "…", "clientSecret": "…"}}`; GitHub OAuth apps allow one callback URL, so one app per web app. GitHub is hidden for origins without an entry. |
| `RECAPTCHA_SECRET_KEY`    | optional             | verification skipped when unset                                                                                                                                                   |
| `RECAPTCHA_MIN_SCORE`     | default `0.5`        | 0–1                                                                                                                                                                               |
| `AUTH_TEST_PROVIDER`      | optional             | `enabled` refused when `APP_ENV=production`                                                                                                                                       |

Web apps add `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (optional).
