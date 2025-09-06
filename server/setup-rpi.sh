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
REQUIRED_VERSION="3.12"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "Error: Python $REQUIRED_VERSION or higher is required (found $PYTHON_VERSION)"
    echo "On Raspberry Pi, you may need to install Python 3.12:"
    echo "  sudo apt update"
    echo "  sudo apt install python3.12 python3.12-venv python3.12-dev"
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

# Backup original pyproject.toml if not already backed up
if [ -f "pyproject.toml" ] && [ ! -f "pyproject-original.toml" ]; then
    echo
    echo "Backing up original pyproject.toml..."
    cp pyproject.toml pyproject-original.toml
fi

# Use the minimal pyproject file for Raspberry Pi
echo
echo "Setting up Raspberry Pi configuration..."
if [ -f "pyproject-rpi.toml" ]; then
    cp pyproject-rpi.toml pyproject.toml
    echo "Using minimal dependencies for Raspberry Pi"
else
    echo "Error: pyproject-rpi.toml not found!"
    exit 1
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
echo "Installing numpy for ARM..."
# For RPi4, we need numpy 1.x which is more compatible
uv pip install --no-cache-dir "numpy<2.0.0"

# Install scikit-image from source for ARM64
echo
echo "Installing scikit-image from source for ARM64 (this will take a while)..."
uv pip install --no-cache-dir --no-binary :all: scikit-image

# Install dependencies
echo
echo "Installing remaining dependencies (this may take a while on Raspberry Pi)..."
uv sync --no-cache

# Test the installation
echo
echo "Testing installation..."
if uv run python -c "import fastapi; import pydantic; import typer; print('Core packages imported successfully ✓')" 2>/dev/null; then
    echo "Installation successful!"
else
    echo "Warning: Some packages may not have imported correctly."
    echo "This is expected if you're testing off the Raspberry Pi."
fi

echo
echo "=== Setup complete! ==="
echo
echo "The server is now configured for Raspberry Pi."
echo "The pyproject.toml has been replaced with the minimal version."
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
echo "To restore the original configuration (with ML dependencies):"
echo "  cp pyproject-original.toml pyproject.toml"
echo "  uv sync"
echo
echo "Note: The first run may be slower as Python compiles bytecode."