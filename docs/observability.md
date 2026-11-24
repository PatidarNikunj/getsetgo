# Observability, analytics and client storage

Everything here is **off until you add keys**, so local development and tests need no accounts.

| Tool                                  | Where                                              | Cookies?    | Needs consent?                                        |
| ------------------------------------- | -------------------------------------------------- | ----------- | ----------------------------------------------------- |
| Sentry (errors + tracing)             | both web apps, `api`, `ai`                         | no          | no (legitimate interest; no personal data, see below) |
| Google Analytics 4                    | browser (gtag.js) and `api` (Measurement Protocol) | yes (`_ga`) | **yes**: loaded only after "Accept analytics"         |
| Vercel Web Analytics + Speed Insights | both web apps, only when deployed on Vercel        | no          | no                                                    |
| Consent cookie `gsg_consent`          | first-party                                        | it _is_ one | no (strictly necessary)                               |
| Form drafts                           | IndexedDB, this device only                        | no          | no (strictly necessary)                               |

> This is a learning project, not legal advice. Check the rules that apply to you before going live.

## How a request is traced

```
browser ──/api/graphql──▶ Next.js proxy ──▶ NestJS api ──▶ FastAPI ai ──▶ Claude
   │ sentry-trace + baggage headers travel along; one trace in Sentry shows all of it
   └─ browser errors go to /<tunnel> on the same app, which forwards them to Sentry
```

- **Tunnel:** the browser SDK uses `tunnel: true`, so events go to the app's own server
  (`serveTunnelIntegration`), which forwards them without the visitor's cookies or headers. The CSP
  needs no Sentry entry and ad blockers don't drop error reports.
- **Trace propagation** is limited to our own services (`/api/graphql`, `API_URL`, `AI_SERVICE_URL`);
  trace headers never go to third parties.

## Privacy rules (OWASP A09)

Sentry 11 collects cookies, headers, request bodies and GraphQL variables **by default**. All of that
is switched off with `dataCollection` (TypeScript) / `data_collection` (Python):

- no cookies, user info, request or response bodies, query parameters, database values or AI prompts/outputs
- GraphQL operation names are kept; their **variables (which contain note text) are not**
- only a short header allow-list (`user-agent`, `content-type`, `x-request-id`, trace headers)
- a `beforeSend` scrubber redacts any field named like a secret or `content`/`summary`

This was checked against a local stand-in for Sentry: no note text, cookies or consent values arrived.

**Google Analytics:** gtag.js isn't even requested until the visitor accepts. Ad features and Google
signals are off. Server-side events (`note_created`, `note_summarized`) are sent by the API **only** when
the consent cookie allows analytics and a `_ga` client id exists; they carry sizes and model names, never
note text. Withdrawing consent deletes the `_ga` cookies and reloads without gtag.

## Consent banner

Both apps show the same accessible banner ("Cookie preferences", **Accept analytics** / **Reject
analytics**, equally easy) and a **Cookie settings** button in the footer to change your mind. The
choice is stored for 180 days in `gsg_consent` (`SameSite=Lax`, `Secure` on HTTPS). The server reads
it, so the banner never flashes for people who already chose. Changing the consent categories? Bump
`CONSENT_VERSION` in `packages/consent` so everyone is asked again.

## Drafts (IndexedDB)

The note form autosaves to IndexedDB (`packages/drafts`, built on `idb`) as you type, and restores it
after a refresh or crash with a "Draft restored · Discard draft" notice. Drafts never leave the device,
expire after 30 days, and are deleted once the note is saved.

## Turning things on

### Sentry

1. Create a free account at https://sentry.io and four projects (Next.js ×2, Node/NestJS, Python/FastAPI),
   or one project for everything.
2. Copy each project's DSN into the env files:

| File                                             | Variables                                   |
| ------------------------------------------------ | ------------------------------------------- |
| `apps/web-material/.env`, `apps/web-shadcn/.env` | `NEXT_PUBLIC_SENTRY_DSN` (public by design) |
| `apps/api/.env`                                  | `SENTRY_DSN`                                |
| `apps/ai/.env`                                   | `SENTRY_DSN`                                |

3. Optional: `*_TRACES_SAMPLE_RATE` (default 0.2 = 20% of requests traced).
4. Source maps (readable stack traces for the web apps): set `SENTRY_ORG`, `SENTRY_PROJECT` and
   `SENTRY_AUTH_TOKEN` where the web apps are **built** (CI or Vercel). Never commit the token.

### Google Analytics

1. Create a GA4 property at https://analytics.google.com and a **Web data stream**; copy its
   measurement id (`G-…`).
2. Web apps: `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-…` (adds GA's origins to the CSP automatically).
3. Server events: in the data stream, create a **Measurement Protocol API secret**, then set
   `GA_MEASUREMENT_ID` and `GA_API_SECRET` in `apps/api/.env`.

### Vercel Analytics and Speed Insights

Nothing to configure: enable them in the Vercel project's dashboard after deploying (Phase 6). They
only render when the `VERCEL` environment variable is present.

### Docker stack

`pnpm stack:up` passes `API_SENTRY_DSN`, `AI_SENTRY_DSN`, `GA_MEASUREMENT_ID` and `GA_API_SECRET` from
the root `.env` to the containers (all optional).

## Tests

- Unit: consent cookie format, Sentry scrubbing and data-collection settings, GA helpers, drafts
  (with `fake-indexeddb`), the API's consent parser (checked against `@getsetgo/consent`), GA
  Measurement Protocol gating.
- E2E (`pnpm test:e2e`): the banner is accessible and no third-party request happens before a choice;
  the choice is remembered (server-rendered, no flash) and can be changed; drafts survive a reload and
  can be discarded. Google requests are always stubbed in tests.
