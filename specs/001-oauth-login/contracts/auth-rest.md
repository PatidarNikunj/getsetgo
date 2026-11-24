# Contract: REST auth routes

Served by `apps/api` under `/auth/*`. Browsers reach them **only** through a web app's same-origin
rewrite `/api/auth/:path*` → `${API_URL}/auth/:path*`, so the paths below are what the browser sees.
All responses carry `Cache-Control: no-store`. Cookies are described in [research D5](../research.md).

Common rules:

- `POST` routes require an `Origin` header ∈ `CORS_ORIGINS`; otherwise they return `403`. This is the
  CSRF check (FR-012).
- Error redirects go to `/sign-in?error=<code>`, with a relative `Location`. The codes are `denied`,
  `invite_only`, `expired`, `bot`, `rate_limited`, `unavailable` and `failed`. Pages map them to
  plain-language messages and never show provider error text.
- Rate limits are in research D14.

## `GET /auth/providers?origin=<web origin>` (public)

Called server-side by the sign-in page (straight to the API). Lists the sign-in options configured for
that web app origin (it must be in `CORS_ORIGINS`; otherwise the list is empty) and whether bot
protection is on.

```json
{ "providers": ["google", "github"], "recaptcha": true }
```

`"test"` appears only when the test provider is enabled (research D12).

## `POST /api/auth/{provider}/start` (public)

`provider` ∈ `google` | `github` | `test`. Body: `application/x-www-form-urlencoded`.

| Field            | Required                     | Rules                                                      |
| ---------------- | ---------------------------- | ---------------------------------------------------------- |
| `recaptchaToken` | when reCAPTCHA is configured | ≤ 4 KB; verified server-side (research D9)                 |
| `returnTo`       | no                           | relative path `^/(?!/)[^\s]*$`, ≤ 512 chars; otherwise `/` |

Responses:

- **303** to the provider's authorization URL, with `response_type=code`, `client_id`,
  `redirect_uri=<origin>/api/auth/{provider}/callback`, `scope`, `state`, `code_challenge` and
  `code_challenge_method=S256`. It also sets `__Host-gsg_oauth`.
- **303** `/sign-in?error=bot|rate_limited|unavailable` (provider not configured for this origin).
- **403** on a bad Origin. **404** on an unknown provider.

## `GET /api/auth/{provider}/callback` (public)

The query comes from the provider: `code` and `state`, or `error`.

1. `error=access_denied` (or any `error`) → 303 `/sign-in?error=denied`.
2. `state` missing, ≠ the `__Host-gsg_oauth` cookie, or not found in Redis (expired or already used)
   → 303 `/sign-in?error=expired`.
3. Exchange the code with the stored PKCE verifier and `redirect_uri`, then fetch and verify the
   identity. A provider failure → 303 `/sign-in?error=unavailable`.
4. Allowlist check → 303 `/sign-in?error=invite_only` (no rows written).
5. Upsert the User and ProviderAccount, create the Session and first RefreshToken, set
   `__Host-gsg_at` and `__Host-gsg_rt`, clear `__Host-gsg_oauth` → **303** to `returnTo`
   (default `/`).

The query string of this route is never logged (research D13).

## `POST /api/auth/refresh` (public; the refresh cookie is the credential)

No body. Used by `proxy.ts` (server-side) and the client's `refreshSession()`.

- **204**: rotated (see the state table in [data-model.md](../data-model.md)). Sets new
  `__Host-gsg_at` and `__Host-gsg_rt`.
- **401** `{ "error": "unauthenticated" }`: missing, unknown, reused, revoked or expired token, or
  the identity is no longer allowlisted. Clears both cookies.

## `POST /api/auth/sign-out` (public; acts on the current cookies)

Native form post or `fetch`. Revokes the current session (`SIGN_OUT`) if the refresh cookie is
valid, and always clears both cookies.

- With `Accept: text/html` (form post): **303** `/sign-in?signedOut=1`.
- Otherwise: **204**.

## Test provider only (`AUTH_TEST_PROVIDER=enabled`, `APP_ENV` ≠ production)

These routes aren't registered at all otherwise (404).

- `GET /api/auth/test/authorize?client_id=test&redirect_uri=…&state=…&code_challenge=…&code_challenge_method=S256`
  renders an HTML form (no scripts) with the fields **Test identity** (login, required), **Email**
  (optional, treated as verified) and the button **Continue**. A **Cancel** button returns
  `error=access_denied`.
- `POST /api/auth/test/authorize` stores a one-time code (Redis, 60 s) bound to `code_challenge` and
  `redirect_uri`, then 303s to `redirect_uri?code=…&state=…`.
- The exchange is in-process (no HTTP), and it verifies `S256(code_verifier) === code_challenge`.
