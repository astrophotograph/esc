#!/bin/bash
# Fast setup script for Raspberry Pi 4 (ARM64)
# Uses pre-built wheels where possible

set -e

echo "=== ESC Telescope Server FAST Setup for Raspberry Pi 4 ==="
echo
echo "This version skips scipy and scikit-image compilation by using older wheels"
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
    pkg-config

# Install uv if not present
if ! command -v uv &> /dev/null; then
    echo
    echo "Installing uv package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Create a minimal pyproject without scipy and scikit-image
echo
echo "Creating minimal pyproject.toml without heavy scientific packages..."
cat > pyproject-minimal.toml << 'EOF'
[project]
name = "smarttel"
version = "0.1.0"
description = "Telescope control server - Minimal RPi version"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "numpy==1.26.4",
    "aiosqlite>=0.21.0",
    "aiortc>=1.9.0",
    "async-timeout>=5.0.1",
    "beartype>=0.21.0",
    "click<8.2",
    "fastapi>=0.115.12",
    "fastapi-restful[all]>=0.6.0",
    "httpx[brotli,http2,zstd]>=0.28.1",
    "loguru>=0.7.3",
    "opencv-python>=4.11.0.86",
    "pydantic>=2.11.4",
    "pydash>=8.0.5",
    "uvicorn[standard]>=0.34.3",
    "websockets>=13.1",
    "pillow>=11.2.1",
    "scopinator>=2025.9.6",
    "psutil>=5.9.8",
    "python-multipart>=0.0.20",
    "tzlocal>=5.3.1",
    "textual>=0.83.0",
    "pyserial>=3.5",
    "pydantic-settings>=2.3.4",
    "requests>=2.32.3",
    "astropy>=6.1.2",
    "matplotlib>=3.8.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
EOF

# Backup original pyproject.toml
if [ -f "pyproject.toml" ] && [ ! -f "pyproject-original.toml" ]; then
    echo
    echo "Backing up original pyproject.toml..."
    cp pyproject.toml pyproject-original.toml
fi

# Use minimal config
cp pyproject-minimal.toml pyproject.toml

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

# Install dependencies without scipy/scikit-image first
echo
echo "Installing core dependencies (fast)..."
uv sync --no-cache

# Now install scipy and scikit-image using pip with pre-built wheels if available
echo
echo "Installing scipy and scikit-image (using pre-built wheels if available)..."
uv pip install scipy scikit-image --prefer-binary --no-deps

# Install any missing dependencies
echo
echo "Installing any remaining dependencies..."
uv pip install scipy scikit-image

# Test the installation
echo
echo "Testing installation..."
if uv run python -c "import fastapi; import pydantic; print('Core packages imported successfully ✓')" 2>/dev/null; then
    echo "Installation successful!"
else
    echo "Warning: Some packages may not have imported correctly."
fi

echo
echo "=== Setup complete! ==="
echo
echo "The server is now configured for Raspberry Pi with minimal compilation."
echo
echo "To run the server:"
echo "  uv run python main.py server"
echo
echo "Note: Some advanced features requiring scipy/scikit-image may not work optimally."
echo "For full functionality, use setup-rpi.sh (but expect long compile times)."