#!/usr/bin/env bash
# Start the Tauri desktop app with correct Python/library paths.
#
# The uv-managed Python 3.13 has its own libpython3.13.so which must
# be on LD_LIBRARY_PATH so the PyO3 runtime doesn't pick up the
# system (Debian) libpython that ships mismatched extension modules.

set -euo pipefail
cd "$(dirname "$0")"

VENV_PYTHON="$PWD/.venv/bin/python"
UV_PYTHON_LIB="$(dirname "$(readlink -f "$VENV_PYTHON")")/../lib"

export PYO3_PYTHON="$VENV_PYTHON"
export PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
export LD_LIBRARY_PATH="${UV_PYTHON_LIB}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec pnpm tauri:dev "$@"
