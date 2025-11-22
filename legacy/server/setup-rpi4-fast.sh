#!/bin/bash
# Fast setup script for Raspberry Pi 4 (ARMv8.0) - tries to avoid compilation
# Uses pre-built wheels where possible, only compiling problematic packages

set -e

echo "=== ESC Fast Setup for Raspberry Pi 4 (ARMv8.0) ==="
echo
echo "This script attempts to use pre-built wheels where possible"
echo "Only compiles packages known to have ARMv8.1+ instruction issues"
echo

# Verify we're on aarch64
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ]; then
    echo "Error: This script is for 64-bit ARM (aarch64) systems"
    echo "Current architecture: $ARCH"
    exit 1
fi

# Install system dependencies
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
    pkg-config

# Install uv if not present
if ! command -v uv &> /dev/null; then
    echo
    echo "Installing uv package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Create minimal pyproject for fast installation
echo
echo "Creating optimized configuration..."
cat > pyproject-pi4-fast.toml << 'EOF'
[project]
name = "smarttel"
version = "0.1.0"
description = "Telescope control server - Pi4 fast setup"
readme = "README.md"
requires-python = ">=3.11,<3.13"  # Try 3.11 which may have more compatible wheels
dependencies = [
    # Core packages - use older versions less likely to have ARMv8.1+
    "numpy==1.24.4",  # Older version, pre-dates many ARMv8.1 optimizations
    "opencv-python==4.8.1.78",  # Older but stable version
    
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
    
    # Image processing - use older versions
    "pillow==10.0.0",  # First 10.x release, likely simpler
    "scipy==1.10.1",  # Pre-1.11, definitely no ARMv8.1+
    "scikit-image==0.21.0",  # Exact minimum version
    "matplotlib==3.7.0",  # Exact minimum version
    
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

cp pyproject-pi4-fast.toml pyproject.toml

# Remove existing environment
if [ -d ".venv" ]; then
    echo "Removing existing virtual environment..."
    rm -rf .venv
fi

if [ -f "uv.lock" ]; then
    echo "Removing existing lock file..."
    rm uv.lock
fi

# Try Python 3.11 first (may have more compatible wheels)
echo
echo "Attempting installation with Python 3.11..."
uv venv --python 3.11 || {
    echo "Python 3.11 not available, trying 3.12..."
    uv venv --python 3.12
}

# Install packages, starting with known problematic ones
echo
echo "Installing packages (attempting pre-built wheels first)..."

# Try to install numpy from wheel first
echo "Installing numpy..."
uv pip install numpy==1.24.4 || {
    echo "Wheel failed, compiling numpy from source with ARMv8.0 flags..."
    CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
    uv pip install --no-binary numpy numpy==1.24.4
}

# Try scipy from wheel
echo "Installing scipy..."
uv pip install scipy==1.10.1 || {
    echo "Wheel failed, compiling scipy from source (this will take time)..."
    CFLAGS="-march=armv8-a -mtune=cortex-a72 -mno-outline-atomics" \
    uv pip install --no-binary scipy scipy==1.10.1
}

# Install rest of packages
echo "Installing remaining packages..."
uv sync

# Quick test for ARMv8.1+ instructions in numpy/scipy (most likely culprits)
echo
echo "Quick check for problematic instructions..."
NUMPY_SO=$(python -c "import numpy; import os; print(os.path.dirname(numpy.__file__))" 2>/dev/null || echo "")
if [ -n "$NUMPY_SO" ]; then
    echo "Checking numpy..."
    if find "$NUMPY_SO" -name "*.so" -exec sh -c 'objdump -d "$1" 2>/dev/null | grep -q "ldaddal\|staddl\|swpal\|casal"' _ {} \; -print | head -1 | grep -q ".so"; then
        echo "⚠️  WARNING: numpy contains ARMv8.1+ instructions - may crash!"
        echo "   Run setup-rpi4-armv8.sh for full compilation from source"
    else
        echo "✓ numpy appears safe"
    fi
fi

SCIPY_SO=$(python -c "import scipy; import os; print(os.path.dirname(scipy.__file__))" 2>/dev/null || echo "")
if [ -n "$SCIPY_SO" ]; then
    echo "Checking scipy..."
    if find "$SCIPY_SO" -name "*.so" -exec sh -c 'objdump -d "$1" 2>/dev/null | grep -q "ldaddal\|staddl\|swpal\|casal"' _ {} \; -print | head -1 | grep -q ".so"; then
        echo "⚠️  WARNING: scipy contains ARMv8.1+ instructions - may crash!"
        echo "   Run setup-rpi4-armv8.sh for full compilation from source"
    else
        echo "✓ scipy appears safe"
    fi
fi

# Test import
echo
echo "Testing installation..."
if uv run python -c "import numpy; import scipy; print('Core packages imported successfully ✓')" 2>/dev/null; then
    echo "Basic import test passed!"
    
    # Try a simple numpy operation that might trigger atomics
    echo "Testing numpy operations..."
    if uv run python -c "import numpy as np; a = np.ones(100); b = np.sum(a); print(f'numpy sum test: {b} ✓')" 2>/dev/null; then
        echo "numpy operations work!"
    else
        echo "⚠️  numpy operations failed - likely has ARMv8.1+ instructions"
        echo "   Run setup-rpi4-armv8.sh for full compilation from source"
    fi
else
    echo "⚠️  Import test failed"
fi

echo
echo "=== Fast setup complete ==="
echo
echo "To run the server:"
echo "  uv run python main.py server"
echo
echo "If you get 'Illegal instruction' errors:"
echo "  Run ./setup-rpi4-armv8.sh for full compilation from source"
echo "  (Takes 1-2 hours but guarantees ARMv8.0 compatibility)"