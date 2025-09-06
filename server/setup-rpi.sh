#!/bin/bash
# Setup script for Raspberry Pi 4 (ARM64)

set -e

echo "=== ESC Telescope Server Setup for Raspberry Pi 4 ==="
echo

# Check if running on ARM64
if [ "$(uname -m)" != "aarch64" ]; then
    echo "Warning: This script is optimized for ARM64 (aarch64) architecture."
    echo "Current architecture: $(uname -m)"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | grep -Po '(?<=Python )\d+\.\d+')
REQUIRED_VERSION="3.10"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "Error: Python $REQUIRED_VERSION or higher is required (found $PYTHON_VERSION)"
    exit 1
fi

echo "Python version: $PYTHON_VERSION ✓"

# Install system dependencies for ARM
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

# Create virtual environment
echo
echo "Creating virtual environment..."
if [ -d ".venv" ]; then
    echo "Virtual environment already exists, removing..."
    rm -rf .venv
fi

uv venv

# Set environment variables for ARM compilation
export OPENBLAS_NUM_THREADS=4
export ATLAS_NUM_THREADS=4
export MKL_NUM_THREADS=4
export NUMEXPR_NUM_THREADS=4
export OMP_NUM_THREADS=4

# Install numpy first with specific flags for ARM using uv
echo
echo "Installing numpy for ARM64..."
uv pip install --no-cache-dir numpy

# Use the minimal pyproject file for Raspberry Pi
echo
echo "Using minimal dependencies for Raspberry Pi..."
if [ -f "pyproject-rpi.toml" ]; then
    mv pyproject.toml pyproject-original.toml
    cp pyproject-rpi.toml pyproject.toml
fi

# Install dependencies
echo
echo "Installing dependencies (this may take a while on Raspberry Pi)..."
uv sync --no-cache

# Restore original pyproject if it was moved
if [ -f "pyproject-original.toml" ]; then
    mv pyproject-original.toml pyproject.toml
fi

# Test the installation
echo
echo "Testing installation..."
uv run python -c "import fastapi; import pydantic; import typer; print('Core packages imported successfully ✓')"

echo
echo "=== Setup complete! ==="
echo
echo "To run the server:"
echo "  uv run python main.py server"
echo
echo "To run with auto-discovery:"
echo "  uv run python main.py server"
echo
echo "To connect directly to a Seestar:"
echo "  uv run python main.py server --seestar-host <IP_ADDRESS>"
echo
echo "Note: The first run may be slower as Python compiles bytecode."