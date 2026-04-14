#!/usr/bin/env bash
# Start the Tauri desktop app in development mode.

set -euo pipefail
cd "$(dirname "$0")"

export PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"

# Seestar S50 firmware 7.18+ requires RSA authentication.
# Set SEESTAR_INTEROP_PEM to the path of your PEM certificate file.
# export SEESTAR_INTEROP_PEM=/path/to/seestar.pem

exec pnpm tauri:dev "$@"
