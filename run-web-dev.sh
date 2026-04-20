#!/usr/bin/env bash
# Start the web version of the app for development.
#
# Builds and runs the Rust web API server in the background, then starts
# the Vite frontend dev server in web mode in the foreground.
#
# Usage: ./run-web-dev.sh [host-ip]
#   host-ip  IP address for TAURI_DEV_HOST (default: 0.0.0.0)

set -euo pipefail
cd "$(dirname "$0")"

HOST="${1:-0.0.0.0}"

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
./target/debug/web_server 2>&1 | tee backend.log &
BACKEND_PID=$!

echo "Starting frontend (TAURI_DEV_HOST=$HOST)..."
TAURI_DEV_HOST="$HOST" pnpm web:dev 2>&1 | tee frontend.log
