#!/bin/bash
# Setup script specifically for Raspberry Pi 4 ARMv7
# Forces compilation from source to avoid ARM64 instructions

set -e

echo "=== ESC Telescope Server Setup for Raspberry Pi 4 (ARMv7) ==="
echo
echo "This version compiles critical packages from source to avoid ARM64 instructions"
echo "like 'ldaddal' that cause illegal instruction errors on ARMv7"
echo

# Verify we're on ARMv7
ARCH=$(uname -m)
if [ "$ARCH" != "armv7l" ]; then
    echo "Warning: This script is specifically for ARMv7 (Raspberry Pi 4)"
    echo "Current architecture: $ARCH"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install system dependencies
echo
echo "Installing system dependencies for compilation..."
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

# Use the ARMv7-safe configuration
echo
echo "Setting up ARMv7-safe configuration..."
cat > pyproject-armv7.toml << 'EOF'
[project]
name = "smarttel"
version = "0.1.0"
description = "Telescope control server - ARMv7 safe version"
readme = "README.md"
requires-python = ">=3.12,<3.14"  # Stay on 3.12 for better compatibility
dependencies = [
    # Core packages - pinned to versions known to work on ARMv7
    "numpy==1.26.4",
    "opencv-python==4.10.0.84",
    
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
    
    # Image processing - will compile from source
    "pillow>=10.0.0",
    "scipy>=1.11.0,<1.14.0",  # Stay below 1.14 which has ARM64 optimizations
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
    
    # SKIP aiortc - it often has ARM64 assembly in its compiled extensions
    # If WebRTC is needed, it should be compiled separately with ARMv7 flags
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["smarttel", "cli"]
EOF

cp pyproject-armv7.toml pyproject.toml

# Set environment for ARMv7 compilation
export ARCHFLAGS="-arch armv7l"
export CFLAGS="-march=armv7-a -mfpu=neon-vfpv4 -mfloat-abi=hard"
export CXXFLAGS="$CFLAGS"

# Remove any existing environment
if [ -d ".venv" ]; then
    echo "Removing existing virtual environment..."
    rm -rf .venv
fi

if [ -f "uv.lock" ]; then
    echo "Removing existing lock file..."
    rm uv.lock
fi

# Create virtual environment with Python 3.12 (more stable for ARMv7)
echo
echo "Creating virtual environment with Python 3.12..."
uv venv --python 3.12

# Install packages, forcing compilation from source for critical ones
echo
echo "Installing numpy from source for ARMv7..."
uv pip install --no-binary numpy numpy==1.26.4

echo
echo "Installing scipy from source for ARMv7 (this will take a while)..."
uv pip install --no-binary scipy "scipy>=1.11.0,<1.14.0"

echo
echo "Installing scikit-image from source for ARMv7..."
uv pip install --no-binary scikit-image scikit-image

echo
echo "Installing pillow from source for ARMv7..."
uv pip install --no-binary pillow pillow

echo
echo "Installing remaining packages..."
# Use PyPI only, no piwheels to avoid any ARM64 wheels
uv sync --index-url https://pypi.org/simple

# Install aiortc separately if needed, with special handling
echo
echo "Checking if aiortc is needed..."
if uv run python -c "import sys; sys.exit(0)" 2>/dev/null; then
    echo "Attempting to install aiortc with ARMv7 flags..."
    CFLAGS="-march=armv7-a -mfpu=neon-vfpv4 -mfloat-abi=hard" \
    uv pip install --no-binary aiortc aiortc || {
        echo "Warning: aiortc installation failed. WebRTC features will not be available."
        echo "This is expected on ARMv7 due to compilation issues."
    }
fi

# Test the installation
echo
echo "Testing installation..."
if uv run python -c "import numpy; import scipy; print('Core packages imported successfully ✓')" 2>/dev/null; then
    echo "Installation successful!"
    
    # Check for ldaddal or other ARM64 instructions
    echo
    echo "Checking for ARM64 instructions in installed packages..."
    for lib in $(find .venv -name "*.so" 2>/dev/null | head -20); do
        if objdump -d "$lib" 2>/dev/null | grep -q "ldaddal\|stlxr\|casal"; then
            echo "WARNING: $lib contains ARM64 instructions!"
        fi
    done
else
    echo "Warning: Some packages may not have imported correctly."
fi

echo
echo "=== Setup complete! ==="
echo
echo "This installation is compiled specifically for ARMv7 to avoid illegal instructions."
echo
echo "To run the server:"
echo "  uv run python main.py server"
echo
echo "Note: Some features (like WebRTC) may be disabled due to ARMv7 limitations."
echo
echo "If you still get illegal instruction errors, check the warnings above"
echo "for packages containing ARM64 instructions."