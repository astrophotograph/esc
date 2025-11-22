#!/bin/bash

# Bundle Python server with embedded Python distribution
# This creates a bundle with Python included, avoiding PyInstaller issues

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
ELECTRON_DIR="$PROJECT_ROOT/electron"
BUNDLE_DIR="$ELECTRON_DIR/python-bundle"

echo "📦 Creating Python embedded bundle..."

# Clean and create bundle directory
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# Detect platform
OS_TYPE="unknown"
ARCH_TYPE="unknown"
PYTHON_VERSION="3.12.9"

if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="macos"
    if [[ $(uname -m) == "arm64" ]]; then
        ARCH_TYPE="arm64"
    else
        ARCH_TYPE="x64"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="linux"
    ARCH_TYPE=$(uname -m)
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ "$OS" == "Windows_NT" ]]; then
    OS_TYPE="windows"
    ARCH_TYPE="x64"
fi

echo "Platform: $OS_TYPE-$ARCH_TYPE"

# Copy Python source files
echo "📄 Copying Python source files..."
cp -r "$SERVER_DIR"/*.py "$BUNDLE_DIR/" 2>/dev/null || true
for dir in api cli config controllers core exceptions graxpert lib middleware models services smarttel static templates tests utils validators data; do
    if [ -d "$SERVER_DIR/$dir" ]; then
        cp -r "$SERVER_DIR/$dir" "$BUNDLE_DIR/"
    fi
done

# Copy pyproject.toml for dependencies
cp "$SERVER_DIR/pyproject.toml" "$BUNDLE_DIR/" 2>/dev/null || true

# Create requirements file from uv
echo "📋 Generating requirements.txt..."
cd "$SERVER_DIR"
if command -v uv &> /dev/null; then
    uv pip compile pyproject.toml -o "$BUNDLE_DIR/requirements.txt" 2>/dev/null || \
    uv pip freeze > "$BUNDLE_DIR/requirements.txt"
else
    echo "Warning: uv not found, creating minimal requirements.txt"
    cat > "$BUNDLE_DIR/requirements.txt" << 'EOF'
fastapi>=0.115.12
uvicorn[standard]>=0.34.3
pydantic>=2.11.4
httpx>=0.28.1
pydash>=8.0.5
numpy>=1.26.0,<2.0
opencv-python>=4.11.0.86
scikit-image>=0.25.2
Pillow>=11.2.1
websockets>=13.1
aiortc>=1.9.0
aiosqlite>=0.21.0
tzlocal>=5.3.1
beartype>=0.21.0
loguru>=0.7.3
netifaces>=0.11.0
click>=8.2.0
appdirs>=1.4.4
psutil>=5.9.8
EOF
fi

# Create platform-specific launcher scripts
echo "🚀 Creating launcher scripts..."

# Windows launcher (batch file)
cat > "$BUNDLE_DIR/esc-server.bat" << 'EOF'
@echo off
setlocal

:: Get the directory of this script
set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

:: Check if embedded Python exists
if exist "%SCRIPT_DIR%\python-embed\python.exe" (
    set PYTHON_EXE=%SCRIPT_DIR%\python-embed\python.exe
    echo Using embedded Python
) else if exist "%SCRIPT_DIR%\venv\Scripts\python.exe" (
    set PYTHON_EXE=%SCRIPT_DIR%\venv\Scripts\python.exe
    echo Using virtual environment Python
) else (
    :: Try to find Python in PATH
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set PYTHON_EXE=python
        echo Using system Python
    ) else (
        echo Error: Python not found!
        echo Please install Python 3.12 or later
        exit /b 1
    )
)

:: Run the server
"%PYTHON_EXE%" "%SCRIPT_DIR%\main.py" %*
EOF

# Unix launcher (shell script)
cat > "$BUNDLE_DIR/esc-server.sh" << 'EOF'
#!/bin/bash
# Launcher script for Python server

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Find Python
if [ -f "$SCRIPT_DIR/python-embed/bin/python3" ]; then
    PYTHON_EXE="$SCRIPT_DIR/python-embed/bin/python3"
    echo "Using embedded Python"
elif [ -f "$SCRIPT_DIR/venv/bin/python" ]; then
    PYTHON_EXE="$SCRIPT_DIR/venv/bin/python"
    echo "Using virtual environment Python"
elif command -v python3 &> /dev/null; then
    PYTHON_EXE="python3"
    echo "Using system Python"
else
    echo "Error: Python not found!"
    echo "Please install Python 3.12 or later"
    exit 1
fi

# Check if virtual environment exists, create if not
if [ ! -d "$SCRIPT_DIR/venv" ] && [ ! -d "$SCRIPT_DIR/python-embed" ]; then
    echo "Creating Python virtual environment..."
    $PYTHON_EXE -m venv "$SCRIPT_DIR/venv"
    "$SCRIPT_DIR/venv/bin/pip" install --upgrade pip
    echo "Installing dependencies..."
    "$SCRIPT_DIR/venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
fi

# Run the server
"$PYTHON_EXE" "$SCRIPT_DIR/main.py" "$@"
EOF

chmod +x "$BUNDLE_DIR/esc-server.sh"

# Create setup script for first-time installation
cat > "$BUNDLE_DIR/setup.py" << 'EOF'
#!/usr/bin/env python3
"""Setup script to install dependencies"""

import os
import sys
import subprocess
import platform

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    requirements_file = os.path.join(script_dir, "requirements.txt")
    
    if not os.path.exists(requirements_file):
        print("Error: requirements.txt not found!")
        return 1
    
    # Check if we're in a virtual environment
    in_venv = hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix)
    
    if not in_venv:
        print("Warning: Not running in a virtual environment")
        print("It's recommended to create a virtual environment first")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            return 0
    
    # Install dependencies
    print("Installing dependencies...")
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r", requirements_file
        ])
        print("✅ Dependencies installed successfully!")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing dependencies: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
EOF

echo ""
echo "✅ Python bundle created at: $BUNDLE_DIR"
echo ""
echo "The bundle includes:"
echo "  - Python source code"
echo "  - requirements.txt with all dependencies"
echo "  - Launcher scripts for each platform"
echo ""
echo "On first run, it will:"
echo "  1. Check for Python (embedded, venv, or system)"
echo "  2. Create virtual environment if needed"
echo "  3. Install dependencies automatically"
echo ""
echo "To use:"
echo "  Windows: $BUNDLE_DIR/esc-server.bat server"
echo "  Unix:    $BUNDLE_DIR/esc-server.sh server"