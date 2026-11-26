#!/usr/bin/env bash
# Shows which rate-limit bucket each kind of request lands in (needs the stack from start.sh).
# Expected: each signed visitor starts a fresh bucket; forged/unsigned headers count against the
# connection IP. Usage: ratelimit-check.sh <CLIENT_IP_SECRET>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
secret="${1:?pass the CLIENT_IP_SECRET the API was started with}"
url="localhost:4000/auth/providers?origin=http%3A%2F%2Flocalhost%3A3000"

remaining() { curl -s -o /dev/null -D - "$@" "$url" | grep -i "x-ratelimit-remaining:" | tr -d '\r' | awk '{print $2}'; }
signed() { mapfile -t H < <(node --experimental-strip-types --no-warnings "$here/sign-ip.mjs" "$1" "$2"); }

echo "connection IP:           $(remaining) then $(remaining)"
signed 203.0.113.7 "$secret"; echo "signed visitor A:        $(remaining "${H[@]}") then $(remaining "${H[@]}")"
signed 198.51.100.1 "$secret"; echo "signed visitor B:        $(remaining "${H[@]}")"
signed 198.51.100.1 "$(openssl rand -base64 48)"; echo "forged (wrong secret):   $(remaining "${H[@]}")"
echo "unsigned spoofed header: $(remaining -H 'x-getsetgo-client-ip: 192.0.2.9')"
