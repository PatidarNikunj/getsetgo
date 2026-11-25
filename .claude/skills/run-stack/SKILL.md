---
name: run-stack
description: Launch and drive the whole getsetgo stack (Postgres/Mongo/Redis in Docker; ai, api and both Next.js web apps on the host) to see it working end to end - sign in with the test provider, create/reload/summarize/delete a note in both apps, check security headers and per-visitor rate limiting, and run the API and web e2e suites against the running servers. Use when asked to run, start, screenshot or verify the app, not just its unit tests.
---

# Run the whole stack

Verified in a Linux cloud container (no GUI). Scripts are in `scripts/` next to this file; run them
from anywhere inside the repo.

## 1. Start

```bash
.claude/skills/run-stack/scripts/start.sh
```

- Databases in Docker (`docker compose up`, no app images); ai on :8000, api on :4000,
  web-material on :3000, web-shadcn on :3001, all production builds.
- The api runs with `APP_ENV=test` (test sign-in provider on), `RATE_LIMIT_PER_MINUTE=2000`, and a
  fresh `CLIENT_IP_SECRET` shared with both web apps (saved to `/tmp/getsetgo-run/client-ip-secret`).
- `SKIP_BUILD=1` reuses the last build. Logs: `/tmp/getsetgo-run/*.log`.
- It ends by printing `/health/ready`; everything should say `"up"`.

## 2. Drive both apps in a browser

```bash
mkdir -p /tmp/getsetgo-run/shots
(cd apps/web-shadcn && node ../../.claude/skills/run-stack/scripts/drive.cjs /tmp/getsetgo-run/shots)
```

For each app it: visits `/` signed out (must land on `/sign-in`), signs in with the test provider,
rejects the cookie banner, creates a note, reloads (the note comes back from the server render),
clicks Summarize, deletes the note, and reports console errors. Add `material` or `shadcn` as a
second argument to run one app. **Look at the screenshots** (`*-2-notes.png`, `*-FAILED.png`).

Headers, for a quick check:

```bash
curl -s -D - -o /dev/null localhost:3001/sign-in | grep -iE "content-security-policy|x-frame|strict-transport"
```

## 3. Per-visitor rate limiting

```bash
.claude/skills/run-stack/scripts/ratelimit-check.sh "$(cat /tmp/getsetgo-run/client-ip-secret)"
```

Each signed visitor must start a fresh bucket; forged and unsigned headers must keep counting down
the connection IP's bucket. Also check that signatures never reach the logs:
`grep -c 'client-ip-signature":"t=' /tmp/getsetgo-run/api.log` must print `0`.

## 4. e2e suites against the running servers

```bash
[ -x /opt/node24/bin/node ] && export PATH=/opt/node24/bin:$PATH   # Jest needs Node 24
pnpm --filter @getsetgo/api test:e2e
(cd apps/web-material && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --trace off)
(cd apps/web-shadcn && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --trace off)
```

Don't set `CI`: without it Playwright reuses the servers from step 1 instead of starting its own.

## 5. Stop

```bash
.claude/skills/run-stack/scripts/stop.sh
```

## Gotchas (all hit while writing this)

- **Node 24 is required.** Some containers default to Node 22 (Jest then fails on ESM imports);
  `start.sh` switches to `/opt/node24/bin` when it exists. In your own shell:
  `export PATH=/opt/node24/bin:$PATH`.
- **The built api ignores `.env`** in production mode; `start.sh` loads `apps/api/.env` itself.
  An empty `CLIENT_IP_SECRET=` there is fine (treated as unset).
- **Wait for hydration before typing.** "Save note" stays disabled until React hydrates; input
  typed earlier is wiped (`docs/frontends.md`, known limitation). `drive.cjs` waits for it.
- **No AI key here:** without `ANTHROPIC_API_KEY` on the ai service, Summarize shows "AI summaries
  are unavailable right now." That is the expected behavior, not a failure.
- **Playwright's own browser download may not match:** use the pre-installed Chromium via
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` (the e2e config reads it).
- **`docker compose --profile apps` (the CI way) can fail** in sandboxes whose proxy blocks package
  downloads inside image builds; that's why the apps run on the host here.
- **uv behind a TLS-intercepting proxy** needs `SSL_CERT_FILE` pointing at the proxy CA bundle
  (`start.sh` sets it when `/root/.ccr/ca-bundle.crt` exists).
