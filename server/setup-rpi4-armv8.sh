#!/bin/bash
# Setup script for Raspberry Pi 4 running 64-bit OS (aarch64)
# Handles ARMv8.0 limitations - avoids ARMv8.1+ instructions like ldaddal

set -e

echo "=== ESC Telescope Server Setup for Raspberry Pi 4 (ARMv8.0) ==="
echo
echo "This script is specifically for Pi4 running 64-bit OS (aarch64)"
echo "It avoids packages with ARMv8.1+ instructions that cause crashes on Pi4"
echo

# Verify we're on aarch64
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ]; then
    echo "Error: This script is for 64-bit ARM (aarch64) systems"
    echo "Current architecture: $ARCH"
    echo "For 32-bit systems, use setup-rpi4-armv7.sh"
    exit 1
fi

# Check if we're on Pi4 (ARMv8.0) or Pi5 (ARMv8.2+)
CPU_INFO=$(lscpu | grep "Model name" || cat /proc/cpuinfo | grep "Model" | head -1)
echo "CPU Info: $CPU_INFO"

if [[ "$CPU_INFO" == *"Cortex-A72"* ]]; then
    echo "Detected Raspberry Pi 4 (Cortex-A72, ARMv8.0)"
    echo "Will compile packages to avoid ARMv8.1+ instructions"
    IS_PI4=true
elif [[ "$CPU_INFO" == *"Cortex-A76"* ]]; then
    echo "Detected Raspberry Pi 5 (Cortex-A76, ARMv8.2+)"
    echo "Can use optimized packages with LSE atomics"
    IS_PI4=false
else
    echo "Unknown CPU model. Assuming ARMv8.0 compatibility needed."
    IS_PI4=true
fi

# Install system dependencies
echo
echo "Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y \
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
    pkg-config \
    cmake \
    python3-dev

# Install uv if not present
if ! command -v uv &> /dev/null; then
    echo
    echo "Installing uv package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Create ARMv8.0-safe configuration
echo
echo "Creating ARMv8.0-safe configuration..."
cat > pyproject-armv8.toml << 'EOF'
[project]
name = "smarttel"
version = "0.1.0"
description = "Telescope control server - ARMv8.0 safe version"
readme = "README.md"
requires-python = ">=3.12,<3.14"
dependencies = [
    # Core packages - pinned to versions that work on ARMv8.0
    "numpy==1.26.4",  # Last 1.x version, less likely to have ARMv8.1+ optimizations
    "opencv-python==4.10.0.84",  # Compatible with numpy 1.x
    
    # Essential packages
    "aiosqlite>=0.21.0",
    "async-timeout>=5.0.1",
    "beartype>=0.21.0",
    "click<8.2",
    "loguru>=0.7.3",
    "pydash>=8.0.5",
    "fastapi>=0.115.0",
    "fastapi-restful[all]>=0.6.0",
    "uvicorn[standard]>=0.29.0",
    "pydantic>=2.5.0",
    "httpx[brotli,http2,zstd]>=0.25.0",
    "websockets>=12.0",
    "sse-starlette>=2.0.0",
    "python-multipart>=0.0.20",
    "tzlocal>=5.0.0",
    "typer>=0.10.0",
    "textual>=0.80.0",
    
    # Image processing - pin to avoid ARMv8.1+ optimizations
    "pillow>=10.0.0",
    "scipy>=1.11.0,<1.14.0",  # Stay below versions with LSE atomics
    "scikit-image>=0.21.0",
    "matplotlib>=3.7.0",
    
    # System and utilities
    "psutil>=5.9.0,<6.0.0",
    "pyserial>=3.5",
    "pydantic-settings>=2.0.0",
    "requests>=2.30.0",
    "scopinator>=2025.9.6",
    "aiofiles>=23.0.0",
    "watchdog>=4.0.0",
    
    # Astronomy packages
    "astroplan>=0.10",
    "astropy>=6.0.0",
    "pyerfa>=2.0.0",
    "astroquery>=0.4.0",
    "starplot>=0.9.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["smarttel", "cli"]
EOF

cp pyproject-armv8.toml pyproject.toml

# Set compilation flags for ARMv8.0 (no LSE)
export CFLAGS="-march=armv8-a -mtune=cortex-a72"
export CXXFLAGS="$CFLAGS"
# Ensure we don't use LSE atomics
export CFLAGS="$CFLAGS -mno-outline-atomics"
export CXXFLAGS="$CXXFLAGS -mno-outline-atomics"

# Remove existing environment
if [ -d ".venv" ]; then
    echo "Removing existing virtual environment..."
    rm -rf .venv
fi

if [ -f "uv.lock" ]; then
    echo "Removing existing lock file..."
    rm uv.lock
fi

# Create virtual environment
echo
echo "Creating virtual environment with Python 3.12..."
uv venv --python 3.12

if [ "$IS_PI4" = true ]; then
    echo
    echo "=== Compiling critical packages from source for ARMv8.0 ==="
    echo "This ensures no ARMv8.1+ instructions (like ldaddal) are used"
    echo
    
    # Compile numpy from source with ARMv8.0 flags
    echo "Compiling numpy for ARMv8.0 (may take 10-15 minutes)..."
    CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
    uv pip install --no-binary numpy numpy==1.26.4
    
    # Compile scipy from source
    echo
    echo "Compiling scipy for ARMv8.0 (may take 30-60 minutes)..."
    CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
    uv pip install --no-binary scipy "scipy>=1.11.0,<1.14.0"
    
    # Compile scikit-image from source
    echo
    echo "Compiling scikit-image for ARMv8.0 (may take 15-30 minutes)..."
    CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
    uv pip install --no-binary scikit-image scikit-image
    
    # Compile pillow from source
    echo
    echo "Compiling pillow for ARMv8.0..."
    CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
    uv pip install --no-binary pillow pillow
fi

# Install remaining packages
echo
echo "Installing remaining packages..."
uv sync

# Try to install aiortc with ARMv8.0 flags
echo
echo "Attempting to install aiortc for ARMv8.0..."
CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
uv pip install aiortc || {
    echo "Warning: aiortc installation failed. WebRTC features will not be available."
}

# Test the installation
echo
echo "Testing installation..."
if uv run python -c "import numpy; import scipy; import cv2; print('Core packages imported successfully ✓')" 2>/dev/null; then
    echo "Installation successful!"
    
    # Check for ARMv8.1+ instructions
    echo
    echo "Checking for ARMv8.1+ instructions in installed packages..."
    FOUND_LSE=false
    echo "Checking first 20 .so files for LSE atomic instructions..."
    for lib in $(find .venv -name "*.so" 2>/dev/null | head -20); do
        if objdump -d "$lib" 2>/dev/null | grep -q "ldaddal\|staddl\|swpal\|casal"; then
            echo "WARNING: $lib contains ARMv8.1+ LSE instructions!"
            FOUND_LSE=true
        fi
    done
    
    if [ "$FOUND_LSE" = true ]; then
        echo
        echo "⚠️  Some packages still contain ARMv8.1+ instructions."
        echo "   These may cause 'Illegal instruction' errors on Pi4."
        echo "   The compilation flags should have prevented this,"
        echo "   but some packages may have pre-compiled extensions."
    else
        echo "✓ No ARMv8.1+ LSE instructions detected in checked libraries"
    fi
else
    echo "Warning: Some packages may not have imported correctly."
fi

echo
echo "=== Setup complete for Raspberry Pi 4 (ARMv8.0) ==="
echo
echo "This installation is compiled specifically for ARMv8.0 architecture"
echo "to avoid ARMv8.1+ instructions like 'ldaddal' that cause crashes on Pi4."
echo
echo "To run the server:"
echo "  uv run python main.py server"
echo
echo "If you still get 'Illegal instruction' errors:"
echo "1. Check which package is causing the issue"
echo "2. Try compiling that specific package from source with:"
echo "   CFLAGS=\"-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics\" \\"
echo "   uv pip install --no-binary <package> <package>"