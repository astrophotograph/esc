#!/bin/bash

# Create a Windows launcher that ensures Python is available
# This creates a simpler, more reliable approach than embedded Python

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUNDLE_DIR="${1:-$SCRIPT_DIR/../electron/python-bundle}"

echo "🚀 Creating Windows Python launcher..."

mkdir -p "$BUNDLE_DIR"

# Create a PowerShell launcher that handles Python installation
cat > "$BUNDLE_DIR/esc-server-launcher.ps1" << 'EOF'
# ESC Server Launcher for Windows
# This script ensures Python is available and runs the server

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "ESC Server Launcher" -ForegroundColor Cyan
Write-Host ""

# Function to test if Python is available and working
function Test-Python {
    param($PythonExe)
    
    try {
        $version = & $PythonExe --version 2>&1
        if ($version -match "Python 3\.(9|1[0-9])") {
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

# Find Python
$PythonExe = $null

# Check for venv in bundle directory
$VenvPython = Join-Path $ScriptDir "venv\Scripts\python.exe"
if (Test-Path $VenvPython) {
    if (Test-Python $VenvPython) {
        $PythonExe = $VenvPython
        Write-Host "Using virtual environment Python" -ForegroundColor Green
    }
}

# Check for system Python
if (-not $PythonExe) {
    $SystemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($SystemPython) {
        if (Test-Python $SystemPython.Path) {
            $PythonExe = $SystemPython.Path
            Write-Host "Using system Python" -ForegroundColor Green
        }
    }
}

# Check for py launcher
if (-not $PythonExe) {
    $PyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($PyLauncher) {
        try {
            $testResult = & py -3 --version 2>&1
            if ($testResult -match "Python 3") {
                $PythonExe = "py -3"
                Write-Host "Using Python via py launcher" -ForegroundColor Green
            }
        } catch {}
    }
}

# If no Python found, prompt to install
if (-not $PythonExe) {
    Write-Host "Python 3.9+ is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Python from: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "Make sure to check 'Add Python to PATH' during installation" -ForegroundColor Yellow
    Write-Host ""
    
    $response = Read-Host "Open Python download page? (y/n)"
    if ($response -eq 'y') {
        Start-Process "https://www.python.org/downloads/"
    }
    
    Write-Host ""
    Write-Host "After installing Python, run this launcher again." -ForegroundColor Cyan
    Read-Host "Press Enter to exit"
    exit 1
}

# Create venv if it doesn't exist
if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    
    if ($PythonExe -eq "py -3") {
        & py -3 -m venv "$ScriptDir\venv"
    } else {
        & $PythonExe -m venv "$ScriptDir\venv"
    }
    
    $PythonExe = $VenvPython
}

# Install/upgrade pip
Write-Host "Ensuring pip is up to date..." -ForegroundColor Yellow
& $PythonExe -m pip install --upgrade pip --quiet

# Check if dependencies are installed
$RequirementsFile = Join-Path $ScriptDir "requirements.txt"
$DepsInstalled = $false

try {
    & $PythonExe -c "import fastapi, uvicorn, pydantic" 2>$null
    $DepsInstalled = $true
    Write-Host "Dependencies verified" -ForegroundColor Green
} catch {
    $DepsInstalled = $false
}

# Install dependencies if needed
if (-not $DepsInstalled -and (Test-Path $RequirementsFile)) {
    Write-Host "Installing dependencies (this may take a few minutes on first run)..." -ForegroundColor Yellow
    & $PythonExe -m pip install -r $RequirementsFile
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install some dependencies" -ForegroundColor Red
        Write-Host "Trying to continue anyway..." -ForegroundColor Yellow
    }
}

# Run the server
$MainPy = Join-Path $ScriptDir "main.py"
if (Test-Path $MainPy) {
    Write-Host ""
    Write-Host "Starting ESC Server..." -ForegroundColor Green
    Write-Host ""
    
    & $PythonExe $MainPy $args
} else {
    Write-Host "Error: main.py not found at $MainPy" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
EOF

# Create a batch file wrapper for the PowerShell script
cat > "$BUNDLE_DIR/esc-server.bat" << 'EOF'
@echo off
powershell.exe -ExecutionPolicy Bypass -File "%~dp0esc-server-launcher.ps1" %*
EOF

# Create a simpler batch file that assumes Python is in PATH
cat > "$BUNDLE_DIR/esc-server-simple.bat" << 'EOF'
@echo off
setlocal

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

:: Try Python commands in order of preference
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python "%SCRIPT_DIR%\main.py" %*
    exit /b %ERRORLEVEL%
)

where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py -3 "%SCRIPT_DIR%\main.py" %*
    exit /b %ERRORLEVEL%
)

echo Python is not installed or not in PATH
echo Please install Python 3.9 or later from https://www.python.org/downloads/
pause
exit /b 1
EOF

echo ""
echo "✅ Windows launcher created!"
echo ""
echo "Files created:"
echo "  - esc-server.bat: Main launcher with automatic Python setup"
echo "  - esc-server-launcher.ps1: PowerShell script with full logic"
echo "  - esc-server-simple.bat: Simple fallback launcher"
echo ""
echo "The launcher will:"
echo "  1. Check for Python (venv, system, or py launcher)"
echo "  2. Prompt to install Python if not found"
echo "  3. Create virtual environment"
echo "  4. Install dependencies from requirements.txt"
echo "  5. Run the server"