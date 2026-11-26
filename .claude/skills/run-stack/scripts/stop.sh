#!/usr/bin/env bash
# Stops the services started by start.sh (by process group, from $RUN_DIR/*.pid) and, unless
# --apps-only is given, the database containers (their data is kept).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
RUN_DIR="${RUN_DIR:-/tmp/getsetgo-run}"
for pidfile in "$RUN_DIR"/*.pid; do
  [ -e "$pidfile" ] || continue
  kill -- "-$(cat "$pidfile")" 2>/dev/null || true
  rm -f "$pidfile"
done
[ "${1:-}" = "--apps-only" ] || docker compose stop >/dev/null 2>&1
echo "Stopped."
