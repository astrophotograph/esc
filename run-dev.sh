#!/usr/bin/env bash
# Start the app in development mode.
#
# Usage: ./run-dev.sh [--web [host-ip]]
#   --web      Run the browser-based web mode instead of the Tauri desktop app.
#              Builds and runs the Rust web API server in the background, then
#              starts the Vite frontend dev server in web mode in the foreground.
#   host-ip    IP address for TAURI_DEV_HOST in web mode (default: 0.0.0.0)

set -euo pipefail
cd "$(dirname "$0")"

export PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"

# Seestar S50 firmware 7.18+ requires RSA authentication.
# Set SEESTAR_INTEROP_PEM to the path of your PEM certificate file.
# export SEESTAR_INTEROP_PEM=/path/to/seestar.pem

WEB_MODE=false
HOST="0.0.0.0"

for arg in "$@"; do
    case "$arg" in
        --web) WEB_MODE=true ;;
        *)     HOST="$arg" ;;
    esac
done

if [ "$WEB_MODE" = false ]; then
    exec pnpm tauri:dev
fi

# --- Web mode ---

echo "Building Rust web server..."
cargo build --manifest-path src-tauri/Cargo.toml --bin web_server

cleanup() {
    echo "Stopping backend..."
    kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Kill any stale web_server process holding port 9846
lsof -ti tcp:9846 | xargs kill -9 2>/dev/null || true

echo "Starting Rust web API server..."
CARGO_MANIFEST_DIR="$(pwd)/src-tauri" ./target/debug/web_server 2>&1 | tee backend.log &
BACKEND_PID=$!

echo "Starting frontend (TAURI_DEV_HOST=$HOST)..."
TAURI_DEV_HOST="$HOST" pnpm web:dev 2>&1 | tee frontend.log
