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

# Check if Python 3.13 is available
if ! command -v python3.13 &> /dev/null; then
    echo
    echo "Python 3.13 not found. Installing..."
    echo "Note: This gives best compatibility with piwheels pre-compiled wheels."
    
    # For Raspberry Pi OS based on Debian Bookworm or later
    sudo apt-get update
    sudo apt-get install -y software-properties-common
    
    # Try to add deadsnakes PPA for older systems
    if [ -f /etc/debian_version ]; then
        sudo add-apt-repository -y ppa:deadsnakes/ppa 2>/dev/null || true
        sudo apt-get update
    fi
    
    # Install Python 3.13
    sudo apt-get install -y python3.13 python3.13-venv python3.13-dev || {
        echo "Warning: Could not install Python 3.13"
        echo "You may need to compile it from source or use Python 3.12"
        echo "To use Python 3.12, edit pyproject-rpi-auto.toml and change requires-python"
    }
fi

# Install system dependencies
echo
echo "Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
    python3-dev \
    python3-pip \
    python3-venv \
    python3.13-dev \
    python3.13-venv \
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

# Create venv and sync with piwheels priority for Python 3.13
echo
echo "Installing dependencies with piwheels priority for Python 3.13..."
echo "Most packages on piwheels now have Python 3.13 wheels."
uv venv --python python3.13
# Use piwheels as primary for Python 3.13, PyPI as fallback
uv sync --index-url https://www.piwheels.org/simple --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match

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