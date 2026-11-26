#!/usr/bin/env bash
# Starts the whole stack production-like on the host: databases in Docker, ai (:8000), api (:4000),
# web-material (:3000), web-shadcn (:3001). Logs and the generated CLIENT_IP_SECRET go to $RUN_DIR.
# Usage: start.sh            (from anywhere inside the repo)
#        SKIP_BUILD=1 start.sh   to reuse an existing build
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
RUN_DIR="${RUN_DIR:-/tmp/getsetgo-run}"
mkdir -p "$RUN_DIR"

# Node 24 is required (NestJS 12 is ESM-only). Some containers default to an older Node.
if [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 24 ]; then
  [ -x /opt/node24/bin/node ] && export PATH=/opt/node24/bin:$PATH
fi
node -e 'if (+process.versions.node.split(".")[0] < 24) { console.error("Node 24+ required"); process.exit(1) }'

# Docker daemon (cloud containers don't start it automatically).
if ! docker info >/dev/null 2>&1; then
  (sudo -n dockerd >"$RUN_DIR/dockerd.log" 2>&1 &) || true
  timeout 60 bash -c 'until docker info >/dev/null 2>&1; do sleep 2; done'
fi

# Behind a TLS-intercepting proxy, uv needs the proxy's CA bundle.
[ -f /root/.ccr/ca-bundle.crt ] && export SSL_CERT_FILE=/root/.ccr/ca-bundle.crt

pnpm install --frozen-lockfile >"$RUN_DIR/install.log" 2>&1
[ -f .env ] || pnpm infra:env
docker compose up -d --wait   # Postgres, Mongo, Redis only (the apps run on the host)
(cd apps/ai && uv sync --frozen >"$RUN_DIR/uv.log" 2>&1 && pnpm db:migrate)
(cd apps/api && pnpm db:deploy)
[ -n "${SKIP_BUILD:-}" ] || pnpm build >"$RUN_DIR/build.log" 2>&1

# Stop anything left from an earlier run.
"$root/.claude/skills/run-stack/scripts/stop.sh" --apps-only >/dev/null 2>&1 || true

# Each service runs detached in its own process group (setsid), with stdin/stdout off the caller,
# and its process-group id saved to $RUN_DIR/<name>.pid so stop.sh can kill it and its children.
launch() { # launch <name> <dir> <command...>
  local name="$1" dir="$2"; shift 2
  (cd "$dir" && exec setsid "$@" >"$RUN_DIR/$name.log" 2>&1 </dev/null) &
  echo $! >"$RUN_DIR/$name.pid"
}

# One shared secret switches on signed visitor IPs between the web apps and the API.
SECRET="${CLIENT_IP_SECRET:-$(openssl rand -base64 48)}"
echo "$SECRET" >"$RUN_DIR/client-ip-secret"

launch ai apps/ai env ENVIRONMENT=test uv run uvicorn app.main:app --port 8000
# The built API doesn't read .env in production mode: load it, then override for e2e-style runs
# (test sign-in provider on, high rate limit because the e2e suites sign in many times a minute).
launch api apps/api bash -c 'set -a && . ./.env && set +a && exec env CLIENT_IP_SECRET="$1" \
  NODE_ENV=production APP_ENV=test RATE_LIMIT_PER_MINUTE="$2" node dist/main.js' _ "$SECRET" "${RATE_LIMIT_PER_MINUTE:-2000}"
launch web-material apps/web-material env CLIENT_IP_SECRET="$SECRET" API_URL=http://localhost:4000 pnpm exec next start --port 3000
launch web-shadcn apps/web-shadcn env CLIENT_IP_SECRET="$SECRET" API_URL=http://localhost:4000 pnpm exec next start --port 3001

timeout 120 bash -c 'until curl -sf localhost:4000/health/ready >/dev/null &&
  curl -s -o /dev/null localhost:3000/sign-in && curl -s -o /dev/null localhost:3001/sign-in; do sleep 1; done'
echo "Stack is up. Logs and CLIENT_IP_SECRET in $RUN_DIR"
curl -s localhost:4000/health/ready && echo
