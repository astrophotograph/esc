#!/usr/bin/env bash
# Start the Tauri desktop app in development mode.

set -euo pipefail
cd "$(dirname "$0")"

export PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export SEESTAR_INTEROP_PEM=/Users/bguthro/Development/seestar.pem

exec pnpm tauri:dev "$@"
