#!/bin/bash
# Quick run script for Raspberry Pi 4
# This ensures the correct configuration is used

set -e

# Ensure we're in the server directory
cd "$(dirname "$0")"

# Check if setup has been run
if [ ! -f "pyproject-original.toml" ]; then
    echo "Please run ./setup-rpi.sh first to configure for Raspberry Pi"
    exit 1
fi

# Ensure we're using the RPi configuration
if [ -f "pyproject-rpi.toml" ]; then
    cp pyproject-rpi.toml pyproject.toml
fi

# Ensure we're using the RPi4 lock file
if [ -f "uv-rpi4.lock" ]; then
    cp uv-rpi4.lock uv.lock
fi

# Run the server
echo "Starting ESC server for Raspberry Pi 4..."
uv run python main.py server "$@"