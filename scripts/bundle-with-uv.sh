#!/bin/bash

# Bundle Python server with uv for dependency management
# This creates a bundle that uses uv instead of pip

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
ELECTRON_DIR="$PROJECT_ROOT/electron"
BUNDLE_DIR="$ELECTRON_DIR/python-bundle"

echo "📦 Creating Python bundle with uv..."

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

# Create Windows launcher that uses uv
cat > "$BUNDLE_DIR/esc-server.bat" << 'EOF'
@echo off
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

echo ESC Server Launcher (uv-based)
echo.

:: Check if Python is available
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo Error: Python is not installed or not in PATH
        echo Please install Python 3.9 or later from https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation
        pause
        exit /b 1
    )
    set PYTHON_CMD=py -3
) else (
    set PYTHON_CMD=python
)

:: Check Python version
for /f "tokens=2" %%i in ('%PYTHON_CMD% --version 2^>^&1') do set PYTHON_VERSION=%%i
echo Found Python %PYTHON_VERSION%

:: Check if uv is installed
%PYTHON_CMD% -m uv --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing uv package manager...
    %PYTHON_CMD% -m pip install --upgrade pip >nul 2>&1
    %PYTHON_CMD% -m pip install uv
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to install uv
        pause
        exit /b 1
    )
)

:: Change to script directory
cd /d "%SCRIPT_DIR%"

:: Check if dependencies are installed
if not exist ".venv" (
    echo Creating virtual environment...
    %PYTHON_CMD% -m uv venv
)

:: Sync dependencies
echo Syncing dependencies with uv...
%PYTHON_CMD% -m uv sync

:: Run the server
echo.
echo Starting ESC Server...
echo.
%PYTHON_CMD% -m uv run python main.py %*
EOF

# Create Unix launcher that uses uv
cat > "$BUNDLE_DIR/esc-server.sh" << 'EOF'
#!/bin/bash
# ESC Server Launcher (uv-based)

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "ESC Server Launcher (uv-based)"
echo ""

# Find Python
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python is not installed"
    echo "Please install Python 3.9 or later"
    exit 1
fi

echo "Found Python: $($PYTHON_CMD --version)"

# Check if uv is installed
if ! $PYTHON_CMD -m uv --version &> /dev/null; then
    echo "Installing uv package manager..."
    $PYTHON_CMD -m pip install --upgrade pip
    $PYTHON_CMD -m pip install uv
    if [ $? -ne 0 ]; then
        echo "Failed to install uv"
        exit 1
    fi
fi

# Change to script directory
cd "$SCRIPT_DIR"

# Check if venv exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m uv venv
fi

# Sync dependencies
echo "Syncing dependencies with uv..."
$PYTHON_CMD -m uv sync

# Run the server
echo ""
echo "Starting ESC Server..."
echo ""
$PYTHON_CMD -m uv run python main.py "$@"
EOF

chmod +x "$BUNDLE_DIR/esc-server.sh"

# Create PowerShell version for better Windows support
cat > "$BUNDLE_DIR/esc-server.ps1" << 'EOF'
# ESC Server Launcher (uv-based) - PowerShell version

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "ESC Server Launcher (uv-based)" -ForegroundColor Cyan
Write-Host ""

# Find Python
$PythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonCmd = "py -3"
} else {
    Write-Host "Error: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.9 or later from https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "Make sure to check 'Add Python to PATH' during installation" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

$version = & $PythonCmd --version 2>&1
Write-Host "Found Python: $version" -ForegroundColor Green

# Check if uv is installed
try {
    & $PythonCmd -m uv --version 2>&1 | Out-Null
} catch {
    Write-Host "Installing uv package manager..." -ForegroundColor Yellow
    & $PythonCmd -m pip install --upgrade pip
    & $PythonCmd -m pip install uv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install uv" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Change to script directory
Set-Location $ScriptDir

# Check if venv exists
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    & $PythonCmd -m uv venv
}

# Sync dependencies
Write-Host "Syncing dependencies with uv..." -ForegroundColor Yellow
& $PythonCmd -m uv sync

# Run the server
Write-Host ""
Write-Host "Starting ESC Server..." -ForegroundColor Green
Write-Host ""
& $PythonCmd -m uv run python main.py $args
EOF

echo ""
echo "✅ Python bundle with uv created at: $BUNDLE_DIR"
echo ""
echo "The bundle includes:"
echo "  - Python source code"
echo "  - pyproject.toml for uv dependency management"
echo "  - Launcher scripts that use uv"
echo ""
echo "Requirements:"
echo "  - Python 3.9+ installed on the system"
echo "  - No other dependencies needed (uv handles everything)"
echo ""
echo "On first run, the launcher will:"
echo "  1. Install uv if not present"
echo "  2. Create virtual environment"
echo "  3. Sync all dependencies with uv"
echo "  4. Run the server"
echo ""
echo "To use:"
echo "  Windows: $BUNDLE_DIR/esc-server.bat server"
echo "  Unix:    $BUNDLE_DIR/esc-server.sh server"