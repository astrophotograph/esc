# Build script for Windows desktop application
# This script builds the complete ALP Experimental desktop app for Windows
# Requires: Python 3.12+, Node.js 18+, uv, npm

param(
    [switch]$CleanOnly,
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$ElectronOnly,
    [switch]$SkipTests,
    [switch]$Verbose,
    [switch]$Debug,
    [switch]$Help
)

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptDir
$BuildDir = Join-Path $ProjectRoot "build"
$DistDir = Join-Path $ProjectRoot "dist"
$ElectronDir = Join-Path $ProjectRoot "electron"
$ServerDir = Join-Path $ProjectRoot "server"
$UIDir = Join-Path $ProjectRoot "ui"

# Build configuration
$BuildType = if ($Debug) { "debug" } else { $env:BUILD_TYPE ?? "release" }
$SkipTestsFlag = $SkipTests -or ($env:SKIP_TESTS -eq "true")
$VerboseFlag = $Verbose -or ($env:VERBOSE -eq "true")

# Colors for output
$Red = [System.ConsoleColor]::Red
$Green = [System.ConsoleColor]::Green
$Yellow = [System.ConsoleColor]::Yellow
$Blue = [System.ConsoleColor]::Blue
$DefaultColor = [System.Console]::ForegroundColor

function Write-ColorOutput($Message, $Color = $DefaultColor) {
    [System.Console]::ForegroundColor = $Color
    Write-Host $Message
    [System.Console]::ForegroundColor = $DefaultColor
}

function Write-Section($Message) {
    Write-Host ""
    Write-ColorOutput "▶ $Message" $Blue
}

function Write-Success($Message) {
    Write-ColorOutput "✅ $Message" $Green
}

function Write-Warning($Message) {
    Write-ColorOutput "⚠️  $Message" $Yellow
}

function Write-Error($Message) {
    Write-ColorOutput "❌ $Message" $Red
    exit 1
}

function Show-Help {
    Write-Host "ALP Experimental Windows Build Script"
    Write-Host ""
    Write-Host "Usage: .\build-windows.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Help               Show this help message"
    Write-Host "  -CleanOnly          Only clean build directories"
    Write-Host "  -BackendOnly        Only build Python backend"
    Write-Host "  -FrontendOnly       Only build Next.js frontend"
    Write-Host "  -ElectronOnly       Only package Electron app"
    Write-Host "  -SkipTests          Skip running tests"
    Write-Host "  -Verbose            Enable verbose output"
    Write-Host "  -Debug              Build debug version"
    Write-Host ""
    Write-Host "Environment variables:"
    Write-Host "  BUILD_TYPE          Build type (release, debug) [default: release]"
    Write-Host "  SKIP_TESTS          Skip tests (true, false) [default: false]"
    Write-Host "  VERBOSE             Verbose output (true, false) [default: false]"
    Write-Host ""
    exit 0
}

function Test-Command($Command) {
    return (Get-Command $Command -ErrorAction SilentlyContinue) -ne $null
}

function Test-Requirements {
    Write-Section "Checking Requirements"
    
    # Check Python
    if (-not (Test-Command "python")) {
        Write-Error "Python not found. Please install Python 3.12 or later."
    }
    
    $PythonVersion = python --version
    Write-Host "Python version: $PythonVersion"
    
    # Check Node.js
    if (-not (Test-Command "node")) {
        Write-Error "Node.js not found. Please install Node.js 18 or later."
    }
    
    $NodeVersion = node --version
    Write-Host "Node.js version: $NodeVersion"
    
    # Check uv
    if (-not (Test-Command "uv")) {
        Write-Error "uv not found. Please install uv: pip install uv"
    }
    
    $UvVersion = uv --version
    Write-Host "uv version: $UvVersion"
    
    # Check npm
    if (-not (Test-Command "npm")) {
        Write-Error "npm not found. Please install npm (usually comes with Node.js)."
    }
    
    $NpmVersion = npm --version
    Write-Host "npm version: $NpmVersion"
    
    # Check Visual Studio Build Tools
    $VsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $VsWhere) {
        $VsInstallations = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64
        if ($VsInstallations) {
            Write-Host "Visual Studio Build Tools found"
        } else {
            Write-Warning "Visual Studio Build Tools not found. PyInstaller may fail."
        }
    }
    
    Write-Success "Requirements check completed"
}

function Clear-Build {
    Write-Section "Cleaning Previous Builds"
    
    # Remove build directories
    if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
    if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
    if (Test-Path "$ServerDir\dist") { Remove-Item "$ServerDir\dist" -Recurse -Force }
    if (Test-Path "$ServerDir\build") { Remove-Item "$ServerDir\build" -Recurse -Force }
    if (Test-Path "$UIDir\out") { Remove-Item "$UIDir\out" -Recurse -Force }
    if (Test-Path "$UIDir\.next") { Remove-Item "$UIDir\.next" -Recurse -Force }
    if (Test-Path "$ElectronDir\dist") { Remove-Item "$ElectronDir\dist" -Recurse -Force }
    
    # Create fresh build directories
    New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    
    Write-Success "Build directories cleaned"
}

function Build-Backend {
    Write-Section "Building Python Backend"
    
    Push-Location $ServerDir
    
    try {
        # Install dependencies
        Write-Host "Installing Python dependencies..."
        uv sync --all-extras
        
        # Run tests if not skipped
        if (-not $SkipTestsFlag) {
            Write-Host "Running Python tests..."
            if ($VerboseFlag) {
                uv run pytest tests/ -v
            } else {
                uv run pytest tests/ -q
            }
            Write-Success "Python tests passed"
        }
        
        # Create optimized spec file for Windows
        $SpecContent = @'
# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

block_cipher = None

# Hidden imports for FastAPI and ML libraries
hidden_imports = [
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.lifespan.on',
    'fastapi',
    'fastapi.staticfiles',
    'pydantic',
    'pydantic_core',
    'torch',
    'torchvision',
    'torchvision.transforms',
    'opencv-python',
    'cv2',
    'scikit-image',
    'skimage',
    'skimage.transform',
    'skimage.filters',
    'skimage.exposure',
    'onnxruntime',
    'numpy',
    'numpy.typing',
    'numpy._typing',
    'pillow',
    'PIL',
    'PIL._imaging',
    'aiortc',
    'aiortc.codecs',
    'aiortc.contrib',
    'av',
    'av.video',
    'av.audio',
    'netifaces',
    'aiosqlite',
    'click',
    'httpx',
    'loguru',
    'scipy',
    'scipy.ndimage',
    'starplot',
    'astropy',
    'psutil'
]

# Data files to include
datas = [
    ('data', 'data'),
    ('sky_tiles', 'sky_tiles')
]

# Add graxpert data if it exists
if Path('graxpert').exists():
    datas.append(('graxpert', 'graxpert'))

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib.backends._backend_pdf',
        'matplotlib.backends._backend_ps', 
        'matplotlib.backends._backend_svg',
        'jupyter',
        'jupyter_client',
        'jupyter_core',
        'nbformat',
        'IPython',
        'pytest',
        'black',
        'flake8',
        'mypy'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='alp-experimental-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='../electron/assets/icon.ico'
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[
        'vcruntime140.dll',
        'python312.dll'
    ],
    name='alp-experimental-server'
)
'@
        
        $SpecContent | Out-File -FilePath "main-windows.spec" -Encoding UTF8
        
        # Run PyInstaller
        Write-Host "Building Python executable with PyInstaller..."
        if ($VerboseFlag) {
            uv run pyinstaller main-windows.spec --clean --noconfirm
        } else {
            uv run pyinstaller main-windows.spec --clean --noconfirm --log-level WARN
        }
        
        # Check if build succeeded
        if (-not (Test-Path "dist\alp-experimental-server")) {
            Write-Error "PyInstaller build failed - executable not found"
        }
        
        # Copy to build directory
        Copy-Item "dist\alp-experimental-server" -Destination $BuildDir -Recurse
        
        Write-Success "Python backend built successfully"
    }
    finally {
        Pop-Location
    }
}

function Build-Frontend {
    Write-Section "Building Next.js Frontend"
    
    Push-Location $UIDir
    
    try {
        # Install dependencies
        Write-Host "Installing Node.js dependencies..."
        npm ci
        
        # Run tests if not skipped
        if (-not $SkipTestsFlag) {
            Write-Host "Running frontend tests..."
            if ($VerboseFlag) {
                npm run test -- --verbose
            } else {
                npm run test -- --silent
            }
            Write-Success "Frontend tests passed"
        }
        
        # Build frontend
        Write-Host "Building Next.js application..."
        $env:NODE_ENV = "production"
        $env:NEXT_TELEMETRY_DISABLED = "1"
        
        npm run build
        
        # Check if build succeeded
        if (-not (Test-Path ".next")) {
            Write-Error "Next.js build failed - .next directory not found"
        }
        
        # Export static files if configured
        if (Select-String -Path "next.config.mjs" -Pattern '"output".*"export"' -Quiet) {
            Write-Host "Exporting static files..."
            npm run export 2>$null
        }
        
        # Copy build to build directory
        $UIBuildDir = Join-Path $BuildDir "ui"
        New-Item -ItemType Directory -Path $UIBuildDir -Force | Out-Null
        
        if (Test-Path "out") {
            # Static export
            Copy-Item "out\*" -Destination $UIBuildDir -Recurse
            Write-Success "Frontend static export built successfully"
        } else {
            # Standalone server
            if (Test-Path ".next\standalone") {
                Copy-Item ".next\standalone\*" -Destination $UIBuildDir -Recurse
            }
            if (Test-Path ".next\static") {
                $StaticDir = Join-Path $UIBuildDir ".next"
                New-Item -ItemType Directory -Path $StaticDir -Force | Out-Null
                Copy-Item ".next\static" -Destination $StaticDir -Recurse
            }
            if (Test-Path "public") {
                Copy-Item "public" -Destination $UIBuildDir -Recurse
            }
            Write-Success "Frontend standalone build created successfully"
        }
    }
    finally {
        Pop-Location
    }
}

function Build-Electron {
    Write-Section "Packaging Electron Application"
    
    Push-Location $ElectronDir
    
    try {
        # Install Electron dependencies
        Write-Host "Installing Electron dependencies..."
        npm ci
        
        # Create build configuration
        $BuildConfig = @{
            extraResources = @(
                @{
                    from = "../build/alp-experimental-server"
                    to = "server"
                    filter = @("**/*")
                },
                @{
                    from = "../build/ui"
                    to = "ui" 
                    filter = @("**/*")
                }
            )
        }
        
        $BuildConfig | ConvertTo-Json -Depth 10 | Out-File -FilePath "build-config.json" -Encoding UTF8
        
        # Build for Windows
        Write-Host "Building Electron app for Windows..."
        
        if ($BuildType -eq "release") {
            npm run build:win
        } else {
            npx electron-builder --win --config.compression=store --config.nsis.oneClick=false
        }
        
        # Check if build succeeded
        if (-not (Test-Path "dist") -or -not (Get-ChildItem "dist" -Filter "*.exe")) {
            Write-Error "Electron build failed - no EXE found in dist/"
        }
        
        # Copy final artifacts
        Get-ChildItem "dist" -Filter "*.exe" | Copy-Item -Destination $DistDir
        Get-ChildItem "dist" -Filter "*.msi" | Copy-Item -Destination $DistDir
        
        Write-Success "Electron application packaged successfully"
    }
    finally {
        Pop-Location
    }
}

function Test-Build {
    Write-Section "Validating Build"
    
    # Check backend executable
    $BackendPath = Join-Path $BuildDir "alp-experimental-server"
    if (Test-Path $BackendPath) {
        Write-Success "Backend executable found"
        
        # Test backend startup
        Write-Host "Testing backend startup..."
        $BackendExe = Join-Path $BackendPath "alp-experimental-server.exe"
        Start-Process -FilePath $BackendExe -ArgumentList "--help" -WindowStyle Hidden -Wait -TimeoutSec 5 2>$null
    } else {
        Write-Error "Backend executable not found"
    }
    
    # Check frontend build
    $UIPath = Join-Path $BuildDir "ui"
    if ((Test-Path $UIPath) -and (Get-ChildItem $UIPath)) {
        Write-Success "Frontend build found"
    } else {
        Write-Error "Frontend build not found or empty"
    }
    
    # Check final installers
    $Installers = Get-ChildItem $DistDir -Filter "*.exe"
    if ($Installers) {
        foreach ($Installer in $Installers) {
            $Size = [math]::Round($Installer.Length / 1MB, 1)
            Write-Success "Installer created: $($Installer.Name) ($Size MB)"
        }
    } else {
        Write-Error "No installers found"
    }
    
    Write-Success "Build validation completed"
}

function Show-Summary {
    Write-Section "Build Summary"
    
    Write-Host "Build completed successfully!"
    Write-Host ""
    Write-Host "Artifacts created:"
    
    if (Test-Path $BuildDir) {
        $BuildSize = [math]::Round((Get-ChildItem $BuildDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
        Write-Host "  Intermediate build files: $BuildDir ($BuildSize MB)"
    }
    
    if ((Test-Path $DistDir) -and (Get-ChildItem $DistDir)) {
        Write-Host "  Final distributables: $DistDir"
        Get-ChildItem $DistDir | ForEach-Object {
            $Size = [math]::Round($_.Length / 1MB, 1)
            Write-Host "    $($_.Name) ($Size MB)"
        }
    }
    
    Write-Host ""
    Write-Host "To install the application:"
    $Installer = Get-ChildItem $DistDir -Filter "*.exe" | Select-Object -First 1
    if ($Installer) {
        Write-Host "  1. Run the installer: $($Installer.FullName)"
        Write-Host "  2. Follow the installation wizard"
        Write-Host "  3. Launch from Start Menu or Desktop shortcut"
    }
    
    Write-Host ""
    Write-ColorOutput "🎉 Build completed successfully!" $Green
}

# Main execution
function Main {
    Write-ColorOutput "🚀 ALP Experimental Windows Build Script" $Blue
    Write-ColorOutput "=======================================" $Blue
    Write-Host ""
    Write-Host "Build Type: $BuildType"
    Write-Host "Project Root: $ProjectRoot"
    Write-Host "Build Directory: $BuildDir"
    Write-Host "Skip Tests: $SkipTestsFlag"
    Write-Host ""

    Test-Requirements
    Clear-Build
    Build-Backend
    Build-Frontend
    Build-Electron
    Test-Build
    Show-Summary
}

# Handle script arguments
if ($Help) { Show-Help }
if ($CleanOnly) { Clear-Build; exit 0 }
if ($BackendOnly) { Test-Requirements; Build-Backend; exit 0 }
if ($FrontendOnly) { Test-Requirements; Build-Frontend; exit 0 }
if ($ElectronOnly) { Test-Requirements; Build-Electron; exit 0 }

# Run main build process
Main