#!/bin/bash
# Unified setup script for Raspberry Pi - handles both 32-bit and 64-bit OS
# Detects whether running 32-bit OS on 64-bit hardware and configures appropriately

set -e

echo "=== ESC Telescope Server Setup for Raspberry Pi ==="
echo

# Detect hardware architecture
HARDWARE_ARCH=$(lscpu | grep "Architecture" | awk '{print $2}')
OS_ARCH=$(uname -m)
echo "Hardware architecture: $HARDWARE_ARCH"
echo "OS architecture: $OS_ARCH"

# Determine if we're running 32-bit OS on 64-bit hardware
IS_32BIT_ON_64BIT=false
if [[ "$HARDWARE_ARCH" == *"aarch64"* ]] || [[ "$HARDWARE_ARCH" == *"arm64"* ]]; then
    if [[ "$OS_ARCH" == "armv7l" ]]; then
        IS_32BIT_ON_64BIT=true
        echo ">>> Detected: 32-bit OS running on 64-bit hardware (Pi4 with Raspberry Pi OS 32-bit)"
        echo ">>> This configuration requires special handling to avoid ARM64 instructions"
    else
        echo ">>> Detected: 64-bit OS on 64-bit hardware"
    fi
elif [[ "$OS_ARCH" == "armv7l" ]]; then
    echo ">>> Detected: 32-bit hardware (older Pi or true ARMv7)"
else
    echo ">>> Unknown configuration - proceeding with caution"
fi

echo

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

# Remove existing environment and lock file
if [ -d ".venv" ]; then
    echo "Removing existing virtual environment..."
    rm -rf .venv
fi

if [ -f "uv.lock" ]; then
    echo "Removing existing lock file..."
    rm uv.lock
fi

# Configure based on architecture
if [ "$IS_32BIT_ON_64BIT" = true ] || [ "$OS_ARCH" = "armv7l" ]; then
    echo
    echo "=== Configuring for 32-bit OS (avoiding ARM64 instructions) ==="
    
    # Create ARMv7-safe configuration
    cat > pyproject-current.toml << 'EOF'
[project]
name = "smarttel"
version = "0.1.0"
description = "Telescope control server - 32-bit ARM safe version"
readme = "README.md"
requires-python = ">=3.12,<3.14"
dependencies = [
    # Core packages - pinned to versions without ARM64 optimizations
    "numpy==1.26.4",  # Last 1.x version with good ARMv7 support
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
    
    # Image processing - avoid versions with ARM64 optimizations
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
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["smarttel", "cli"]
EOF

    cp pyproject-current.toml pyproject.toml
    
    # Set compilation flags for ARMv7
    export ARCHFLAGS="-arch armv7l"
    export CFLAGS="-march=armv7-a -mfpu=neon-vfpv4 -mfloat-abi=hard"
    export CXXFLAGS="$CFLAGS"
    
    echo
    echo "Creating Python 3.12 virtual environment..."
    uv venv --python 3.12
    
    # Check if we should compile from source or use wheels
    if [ "$IS_32BIT_ON_64BIT" = true ]; then
        echo
        echo "32-bit OS on 64-bit hardware detected."
        echo "Choose installation method:"
        echo "1) Fast - Use pre-compiled wheels (may have issues if any contain ARM64 code)"
        echo "2) Safe - Compile critical packages from source (takes 1+ hours but guarantees compatibility)"
        read -p "Enter choice (1 or 2): " -n 1 -r
        echo
        
        if [[ $REPLY == "2" ]]; then
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
        fi
    fi
    
    echo
    echo "Installing remaining packages..."
    # For 32-bit OS, prioritize PyPI to avoid potential ARM64 wheels from piwheels
    uv sync --index-url https://pypi.org/simple
    
    # Try to install aiortc
    echo
    echo "Attempting to install aiortc..."
    uv pip install aiortc || {
        echo "Warning: aiortc installation failed. WebRTC features will not be available."
    }
    
else
    echo
    echo "=== Configuring for 64-bit OS ==="
    
    # Use the auto-resolving configuration
    if [ -f "pyproject-rpi-auto.toml" ]; then
        cp pyproject-rpi-auto.toml pyproject.toml
        echo "Using auto-resolving configuration for 64-bit"
    else
        echo "Using default pyproject.toml"
    fi
    
    echo
    echo "Creating Python 3.13 virtual environment..."
    uv venv --python 3.13
    
    echo
    echo "Installing packages with piwheels priority..."
    export UV_EXTRA_INDEX_URL="https://www.piwheels.org/simple"
    uv sync --index-url https://www.piwheels.org/simple --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match
fi

# Test the installation
echo
echo "Testing installation..."
if uv run python -c "import numpy; import scipy; import cv2; print('Core packages imported successfully ✓')" 2>/dev/null; then
    echo "Installation successful!"
    
    # Check for ARM64 instructions if on 32-bit OS
    if [ "$IS_32BIT_ON_64BIT" = true ] || [ "$OS_ARCH" = "armv7l" ]; then
        echo
        echo "Checking for ARM64 instructions in installed packages..."
        FOUND_ARM64=false
        for lib in $(find .venv -name "*.so" 2>/dev/null | head -20); do
            if objdump -d "$lib" 2>/dev/null | grep -q "ldaddal\|stlxr\|casal"; then
                echo "WARNING: $lib contains ARM64 instructions!"
                FOUND_ARM64=true
            fi
        done
        
        if [ "$FOUND_ARM64" = true ]; then
            echo
            echo "⚠️  Some packages contain ARM64 instructions that will cause crashes."
            echo "   Re-run this script and choose option 2 to compile from source."
        else
            echo "✓ No ARM64 instructions detected in checked libraries"
        fi
    fi
else
    echo "Warning: Some packages may not have imported correctly."
fi

echo
echo "=== Setup complete! ==="
echo

if [ "$IS_32BIT_ON_64BIT" = true ]; then
    echo "Your Pi4 is running a 32-bit OS on 64-bit hardware."
    echo "This configuration has been handled to avoid ARM64 instruction errors."
    echo
    echo "For best performance, consider upgrading to Raspberry Pi OS 64-bit,"
    echo "but the current setup should work correctly."
elif [ "$OS_ARCH" = "armv7l" ]; then
    echo "Running on 32-bit ARM architecture."
else
    echo "Running on 64-bit ARM architecture with optimized packages."
fi

echo
echo "To run the server:"
echo "  uv run python main.py server"
echo
echo "Note: If you experience 'Illegal instruction' errors, re-run this script"
echo "and choose the 'compile from source' option if available."