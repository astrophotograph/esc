#!/bin/bash
# Setup script for Raspberry Pi 4 using piwheels.org
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

# Configure pip to use piwheels
echo
echo "Configuring pip to use piwheels.org for pre-built ARM wheels..."
mkdir -p ~/.config/pip
cat > ~/.config/pip/pip.conf << 'EOF'
[global]
extra-index-url=https://www.piwheels.org/simple
EOF

# Use the base pyproject file
if [ -f "pyproject-base-rpi.toml" ]; then
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

python3 -m venv .venv
source .venv/bin/activate

# Install pip and wheel first
pip install --upgrade pip wheel

# Install numpy first (critical for other packages)
echo
echo "Installing numpy from piwheels..."
pip install numpy==1.26.4 --extra-index-url https://www.piwheels.org/simple

# Install scipy and scikit-image from piwheels
echo
echo "Installing scipy and scikit-image from piwheels (pre-compiled)..."
pip install scipy==1.13.1 scikit-image==0.22.0 --extra-index-url https://www.piwheels.org/simple

# Install other dependencies
echo
echo "Installing remaining dependencies..."
pip install -e . --extra-index-url https://www.piwheels.org/simple

# Test the installation
echo
echo "Testing installation..."
if python -c "import numpy; import scipy; import skimage; print('Scientific packages imported successfully ✓')" 2>/dev/null; then
    echo "Installation successful!"
else
    echo "Warning: Some packages may not have imported correctly."
fi

echo
echo "=== Setup complete! ==="
echo
echo "The server is now configured for Raspberry Pi using piwheels."
echo "Installation should have been much faster than compiling from source."
echo
echo "To run the server:"
echo "  source .venv/bin/activate"
echo "  python main.py server"
echo
echo "Or using uv:"
echo "  uv run python main.py server"