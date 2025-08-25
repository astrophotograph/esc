#!/bin/bash

# Download Python embedded distribution for Windows
# This gets a portable Python that doesn't need installation

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUNDLE_DIR="${1:-$SCRIPT_DIR/../electron/python-bundle}"
PYTHON_VERSION="3.12.9"

echo "📥 Downloading Python embedded distribution for Windows..."

mkdir -p "$BUNDLE_DIR"
cd "$BUNDLE_DIR"

# Download Windows x64 embedded Python
PYTHON_EMBED_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"
PYTHON_EMBED_FILE="python-embed.zip"

echo "Downloading from: $PYTHON_EMBED_URL"

if command -v curl &> /dev/null; then
    curl -L -o "$PYTHON_EMBED_FILE" "$PYTHON_EMBED_URL"
elif command -v wget &> /dev/null; then
    wget -O "$PYTHON_EMBED_FILE" "$PYTHON_EMBED_URL"
else
    echo "Error: Neither curl nor wget found!"
    exit 1
fi

# Extract Python
echo "📦 Extracting Python..."
mkdir -p python-embed
cd python-embed
unzip -q "../$PYTHON_EMBED_FILE"
cd ..
rm "$PYTHON_EMBED_FILE"

# Modify python312._pth to allow imports from current directory and pip
echo "🔧 Configuring embedded Python..."
if [ -f "python-embed/python312._pth" ]; then
    # Add current directory and Lib/site-packages to path
    cat > "python-embed/python312._pth" << 'EOF'
python312.zip
.
..
Lib
Lib/site-packages
import site
EOF
fi

# Download get-pip.py
echo "📥 Downloading pip installer..."
curl -L -o "python-embed/get-pip.py" https://bootstrap.pypa.io/get-pip.py

# Create a batch script to install pip (must be run on Windows)
cat > "python-embed/install-pip.bat" << 'EOF'
@echo off
echo Installing pip...
python.exe get-pip.py --no-warn-script-location
if %ERRORLEVEL% EQU 0 (
    echo Pip installed successfully!
    del get-pip.py
) else (
    echo Failed to install pip!
    exit /b 1
)
EOF

# Create a batch script to install requirements
cat > "install-requirements.bat" << 'EOF'
@echo off
setlocal

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

echo Installing Python package dependencies...

:: Use embedded Python's pip
"%SCRIPT_DIR%\python-embed\python.exe" -m pip install --upgrade pip
"%SCRIPT_DIR%\python-embed\python.exe" -m pip install -r "%SCRIPT_DIR%\requirements.txt"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ All dependencies installed successfully!
) else (
    echo.
    echo ❌ Failed to install some dependencies
    exit /b 1
)
EOF

# Update the Windows launcher to use embedded Python
cat > "esc-server.exe.bat" << 'EOF'
@echo off
setlocal

:: Get the directory of this script
set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

:: Use embedded Python
set PYTHON_EXE=%SCRIPT_DIR%\python-embed\python.exe

if not exist "%PYTHON_EXE%" (
    echo Error: Embedded Python not found at %PYTHON_EXE%
    echo Please run download-python-embed.sh first
    exit /b 1
)

:: Check if pip is installed
"%PYTHON_EXE%" -m pip --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing pip...
    cd "%SCRIPT_DIR%\python-embed"
    python.exe get-pip.py --no-warn-script-location
    cd "%SCRIPT_DIR%"
)

:: Check if dependencies are installed (quick check for fastapi)
"%PYTHON_EXE%" -c "import fastapi" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing dependencies...
    "%PYTHON_EXE%" -m pip install -r "%SCRIPT_DIR%\requirements.txt"
)

:: Run the server
"%PYTHON_EXE%" "%SCRIPT_DIR%\main.py" %*
EOF

echo ""
echo "✅ Python embedded distribution downloaded!"
echo ""
echo "Contents:"
ls -la python-embed/ | head -10
echo ""
echo "To complete setup on Windows:"
echo "  1. Run: python-embed\install-pip.bat"
echo "  2. Run: install-requirements.bat"
echo "  3. Run server: esc-server.exe.bat server"