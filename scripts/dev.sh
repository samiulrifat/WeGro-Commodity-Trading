#!/usr/bin/env bash
# The local stack, one command: the chain (8545), the backend (3000, watch
# mode) and the frontend (5173). Starts only what is down, each detached so
# it outlives the terminal; logs in ~/.local/state/wegro-dev.
#
# The Hardhat chain keeps nothing when it stops. If it comes back empty the
# database no longer matches it, so the dev data is reset with the sample
# data, the super admin's password read from .env.local (git-ignored):
#   SUPER_ADMIN_PASSWORD=...
#
#   npm run dev         start what is down (resetting the data if needed)
#   npm run dev:stop    stop all three
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$HOME/.local/state/wegro-dev"
mkdir -p "$LOGS"

up() { ss -ltn | grep -q ":$1 "; }

# The process group listening on a port, to stop it with its children.
stop_port() {
  local pid pgid
  pid="$(ss -ltnpH "sport = :$1" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
  [ -n "$pid" ] || return 0
  pgid="$(ps -o pgid= -p "$pid" | tr -d ' ')"
  kill -- "-$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do up "$1" || return 0; sleep 0.5; done
}

wait_port() {
  for _ in $(seq 1 "${2:-60}"); do up "$1" && return 0; sleep 1; done
  echo "Port $1 did not open; see $LOGS" >&2
  return 1
}

start() { # name, dir, command...
  local name="$1" dir="$2"
  shift 2
  # exec: nothing stays behind holding this script's output open.
  (cd "$dir" && exec setsid nohup "$@" >"$LOGS/$name.log" 2>&1 </dev/null) &
}

if [ "${1:-}" = "stop" ]; then
  for port in 5173 3000 8545; do stop_port "$port"; done
  echo "Stopped."
  exit 0
fi

if ! up 8545; then
  echo "Starting the chain…"
  start chain "$ROOT/contracts" npx hardhat node --network devChain
  wait_port 8545
fi

# The contracts the backend uses: on the chain, or the chain is new.
deployed="$ROOT/contracts/ignition/deployments/chain-31337/deployed_addresses.json"
address="$(grep -o '"PlatformModule#AccessRegistry": *"0x[0-9a-fA-F]*"' "$deployed" 2>/dev/null | grep -o '0x[0-9a-fA-F]*' || true)"
code="0x"
if [ -n "$address" ]; then
  code="$(curl -s -X POST -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$address\",\"latest\"]}" \
    http://127.0.0.1:8545 | grep -o '"result":"0x[0-9a-fA-F]*"' | cut -d'"' -f4)"
fi

if [ "$code" = "0x" ] || [ -z "$code" ]; then
  password="$(grep -E '^SUPER_ADMIN_PASSWORD=' "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  if [ -z "$password" ]; then
    echo "The chain is new and the data must be reset, but .env.local has no SUPER_ADMIN_PASSWORD." >&2
    exit 1
  fi
  echo "The chain is new: resetting the dev data with the sample data (a few minutes)…"
  stop_port 3000
  (cd "$ROOT/backend" && SUPER_ADMIN_PASSWORD="$password" npm run data:reset -- \
    --yes --name "Super Admin" --phone 01711000000 --seed >"$LOGS/reset.log" 2>&1) || {
    echo "The reset failed; see $LOGS/reset.log" >&2
    exit 1
  }
  grep -o 'Sign-in details: .*' "$LOGS/reset.log" || true
fi

if ! up 3000; then
  echo "Starting the backend…"
  start backend "$ROOT/backend" npm run start:dev
  wait_port 3000 120
fi

if ! up 5173; then
  echo "Starting the frontend…"
  start frontend "$ROOT/frontend" npx vite --port 5173 --strictPort --host 127.0.0.1
  wait_port 5173
fi

echo "Running: http://localhost:5173 (API :3000, chain :8545). Logs: $LOGS"
