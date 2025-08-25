#!/bin/bash

# Bundle Python server with standalone uv binary
# uv will handle Python installation and dependency management

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
ELECTRON_DIR="$PROJECT_ROOT/electron"
BUNDLE_DIR="$ELECTRON_DIR/python-bundle"

echo "📦 Creating Python bundle with standalone uv..."

# Clean and create bundle directory
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# Copy Python source files
echo "📄 Copying Python source files..."
cp -r "$SERVER_DIR"/*.py "$BUNDLE_DIR/" 2>/dev/null || true
for dir in api cli config controllers core exceptions graxpert lib middleware models services smarttel static templates tests utils validators data; do
    if [ -d "$SERVER_DIR/$dir" ]; then
        cp -r "$SERVER_DIR/$dir" "$BUNDLE_DIR/"
    fi
done

# Copy pyproject.toml for uv
cp "$SERVER_DIR/pyproject.toml" "$BUNDLE_DIR/" 2>/dev/null || true

# Download uv binaries for different platforms
echo "📥 Downloading uv binaries..."

UV_VERSION="0.5.21"  # Latest stable version
mkdir -p "$BUNDLE_DIR/bin"

# Function to download uv
download_uv() {
    local platform=$1
    local url=$2
    local output=$3
    
    echo "  Downloading uv for $platform..."
    if command -v curl &> /dev/null; then
        curl -L -o "$output" "$url"
    elif command -v wget &> /dev/null; then
        wget -O "$output" "$url"
    else
        echo "Warning: Neither curl nor wget found, skipping $platform"
        return 1
    fi
    
    # Extract if it's a zip file  
    if [[ "$output" == *.zip ]]; then
        unzip -q -o "$output" -d "$BUNDLE_DIR/bin"
        rm "$output"
    elif [[ "$output" == *.tar.gz ]]; then
        # Extract directly to bin/ - the tar files already contain the correct subdirectory structure
        tar -xzf "$output" -C "$BUNDLE_DIR/bin"
        # Make the binaries executable
        find "$BUNDLE_DIR/bin" -name "uv" -type f -exec chmod +x {} \;
        rm "$output"
    fi
}

# Download for Windows
download_uv "Windows x64" \
    "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip" \
    "$BUNDLE_DIR/bin/uv-windows.zip"

# Download for macOS (both architectures)
download_uv "macOS x64" \
    "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-apple-darwin.tar.gz" \
    "$BUNDLE_DIR/bin/uv-macos-x64.tar.gz"

download_uv "macOS ARM64" \
    "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-aarch64-apple-darwin.tar.gz" \
    "$BUNDLE_DIR/bin/uv-macos-arm64.tar.gz"

# Download for Linux
download_uv "Linux x64" \
    "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz" \
    "$BUNDLE_DIR/bin/uv-linux-x64.tar.gz"

# Create Windows launcher that uses standalone uv
cat > "$BUNDLE_DIR/esc-server.bat" << 'EOF'
@echo off
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%
set UV_EXE=%SCRIPT_DIR%\bin\uv.exe

echo ESC Server Launcher (uv standalone)
echo.

:: Check if uv binary exists
if not exist "%UV_EXE%" (
    echo Error: uv.exe not found at %UV_EXE%
    echo Please ensure the bundle was properly extracted
    pause
    exit /b 1
)

:: Change to script directory
cd /d "%SCRIPT_DIR%"

:: Let uv manage Python - it will download if needed
echo Ensuring Python is available...
"%UV_EXE%" python install 3.12 >nul 2>&1

:: Create venv if it doesn't exist
if not exist ".venv" (
    echo Creating virtual environment...
    "%UV_EXE%" venv
)

:: Sync dependencies
echo Syncing dependencies...
"%UV_EXE%" sync

:: Run the server
echo.
echo Starting ESC Server...
echo.
"%UV_EXE%" run python main.py %*
EOF

# Create Unix launcher that uses standalone uv
cat > "$BUNDLE_DIR/esc-server.sh" << 'EOF'
#!/bin/bash
# ESC Server Launcher (uv standalone)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Detect architecture and OS
OS="unknown"
ARCH="unknown"

if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    if [[ $(uname -m) == "arm64" ]]; then
        ARCH="arm64"
        UV_BINARY="uv-aarch64-apple-darwin"
    else
        ARCH="x64"
        UV_BINARY="uv-x86_64-apple-darwin"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    ARCH="x64"
    UV_BINARY="uv-x86_64-unknown-linux-gnu"
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

UV_EXE="$SCRIPT_DIR/bin/$UV_BINARY/uv"

echo "ESC Server Launcher (uv standalone)"
echo ""

# Check if uv binary exists
if [ ! -f "$UV_EXE" ]; then
    echo "Error: uv not found at $UV_EXE"
    echo "Please ensure the bundle was properly extracted"
    exit 1
fi

# Make uv executable
chmod +x "$UV_EXE"

# Change to script directory
cd "$SCRIPT_DIR"

# Let uv manage Python - it will download if needed
echo "Ensuring Python is available..."
"$UV_EXE" python install 3.12 2>/dev/null || true

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    "$UV_EXE" venv
fi

# Sync dependencies
echo "Syncing dependencies..."
"$UV_EXE" sync

# Run the server
echo ""
echo "Starting ESC Server..."
echo ""
"$UV_EXE" run python main.py "$@"
EOF

chmod +x "$BUNDLE_DIR/esc-server.sh"

# Create PowerShell version for Windows
cat > "$BUNDLE_DIR/esc-server.ps1" << 'EOF'
# ESC Server Launcher (uv standalone) - PowerShell version

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$UvExe = Join-Path $ScriptDir "bin\uv.exe"

Write-Host "ESC Server Launcher (uv standalone)" -ForegroundColor Cyan
Write-Host ""

# Check if uv binary exists
if (-not (Test-Path $UvExe)) {
    Write-Host "Error: uv.exe not found at $UvExe" -ForegroundColor Red
    Write-Host "Please ensure the bundle was properly extracted" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Change to script directory
Set-Location $ScriptDir

# Let uv manage Python - it will download if needed
Write-Host "Ensuring Python is available..." -ForegroundColor Yellow
& $UvExe python install 3.12 2>$null

# Create venv if it doesn't exist
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    & $UvExe venv
}

# Sync dependencies
Write-Host "Syncing dependencies..." -ForegroundColor Yellow
& $UvExe sync

# Run the server
Write-Host ""
Write-Host "Starting ESC Server..." -ForegroundColor Green
Write-Host ""
& $UvExe run python main.py $args
EOF

# Create a Python version config for uv
cat > "$BUNDLE_DIR/.python-version" << EOF
3.12
EOF

echo ""
echo "✅ Python bundle with standalone uv created at: $BUNDLE_DIR"
echo ""
echo "The bundle includes:"
echo "  - Python source code"
echo "  - pyproject.toml for dependency management"
echo "  - uv binaries for all platforms"
echo "  - Launcher scripts that use standalone uv"
echo ""
echo "Requirements:"
echo "  - Nothing! uv will download Python if needed"
echo ""
echo "On first run, the launcher will:"
echo "  1. Download Python 3.12 if not available (using uv)"
echo "  2. Create virtual environment"
echo "  3. Sync all dependencies"
echo "  4. Run the server"
echo ""
echo "File sizes:"
ls -lh "$BUNDLE_DIR/bin/" 2>/dev/null | grep uv || echo "  uv binaries: ~10-15MB each"
echo ""
echo "To use:"
echo "  Windows: $BUNDLE_DIR/esc-server.bat server"
echo "  Unix:    $BUNDLE_DIR/esc-server.sh server"