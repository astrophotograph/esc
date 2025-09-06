#!/bin/bash
# Setup script for Raspberry Pi 4 using piwheels.org with uv
# This uses pre-compiled wheels specifically for Raspberry Pi

set -e

echo "=== ESC Telescope Server Setup for Raspberry Pi 4 (using piwheels) ==="
echo
echo "This version uses pre-compiled wheels from piwheels.org"
echo "Much faster than compiling from source!"
echo

# Check if running on ARM
if [ "$(uname -m)" != "aarch64" ] && [ "$(uname -m)" != "armv7l" ]; then
    echo "Warning: This script is optimized for ARM architecture."
    echo "Current architecture: $(uname -m)"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install system dependencies
echo
echo "Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    python3-dev \
    python3-pip \
    python3-venv \
    build-essential \
    libatlas-base-dev \
    libopenblas-dev \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    libfreetype6-dev \
    libhdf5-dev \
    libffi-dev \
    libssl-dev \
    gfortran \
    pkg-config

# Install uv if not present
if ! command -v uv &> /dev/null; then
    echo
    echo "Installing uv package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Configure uv to use piwheels as an extra index
echo
echo "Configuring uv to use piwheels.org for pre-built ARM wheels..."
export UV_EXTRA_INDEX_URL="https://www.piwheels.org/simple"

# Use the auto-resolving pyproject file for piwheels
if [ -f "pyproject-rpi-auto.toml" ]; then
    cp pyproject-rpi-auto.toml pyproject.toml
    echo "Using auto-resolving RPi configuration for piwheels"
elif [ -f "pyproject-base-rpi.toml" ]; then
    cp pyproject-base-rpi.toml pyproject.toml
    echo "Using base RPi configuration"
elif [ -f "pyproject-rpi.toml" ]; then
    cp pyproject-rpi.toml pyproject.toml
    echo "Using RPi configuration"
else
    echo "Error: No RPi configuration found!"
    exit 1
fi

# Create virtual environment
echo
echo "Creating virtual environment..."
if [ -d ".venv" ]; then
    echo "Virtual environment already exists, removing..."
    rm -rf .venv
fi

# Remove any existing lock file to force fresh resolution
if [ -f "uv.lock" ]; then
    echo "Removing existing lock file for fresh dependency resolution..."
    rm uv.lock
fi

# Create venv and sync with PyPI first, piwheels as fallback
echo
echo "Installing dependencies with PyPI priority, piwheels as fallback..."
echo "This avoids Python version conflicts while still using pre-compiled wheels where helpful."
uv venv
# Use PyPI as primary, piwheels as extra - this way we get PyPI's Python 3.12 wheels first
uv sync --index-url https://pypi.org/simple --extra-index-url https://www.piwheels.org/simple --index-strategy unsafe-first-match

# Test the installation
echo
echo "Testing installation..."
if uv run python -c "import numpy; import scipy; import skimage; print('Scientific packages imported successfully ✓')" 2>/dev/null; then
    echo "Installation successful!"
else
    echo "Warning: Some packages may not have imported correctly."
fi

echo
echo "=== Setup complete! ==="
echo
echo "The server is now configured for Raspberry Pi using piwheels."
echo "All packages were installed from pre-compiled wheels where available."
echo
echo "To run the server:"
echo "  uv run python main.py server"
echo
echo "Note: Using piwheels means you get pre-compiled wheels for ALL packages,"
echo "not just scipy/scikit-image, making the entire installation much faster."