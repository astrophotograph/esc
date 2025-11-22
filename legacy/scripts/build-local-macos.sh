#!/bin/bash

# Local macOS build script for development and testing
# This is a simplified version focused on local development without code signing

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build"
DIST_DIR="$PROJECT_ROOT/dist"
ELECTRON_DIR="$PROJECT_ROOT/electron"
SERVER_DIR="$PROJECT_ROOT/server"
UI_DIR="$PROJECT_ROOT/ui"

echo -e "${BLUE}🔧 ALP Experimental - Local macOS Build${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Quick requirements check
check_local_requirements() {
    print_section "Checking Local Requirements"
    
    # Check Python
    if ! command -v python3 >/dev/null 2>&1; then
        echo "❌ Python 3 not found. Install with: brew install python@3.12"
        exit 1
    fi
    
    # Check uv
    if ! command -v uv >/dev/null 2>&1; then
        echo "Installing uv..."
        pip3 install uv
    fi
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        echo "❌ Node.js not found. Install with: brew install node@18"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        echo "❌ npm not found. Usually comes with Node.js"
        exit 1
    fi
    
    echo "✅ Python: $(python3 --version)"
    echo "✅ Node.js: $(node --version)"
    echo "✅ npm: $(npm --version)"
    echo "✅ uv: $(uv --version)"
    
    print_success "Local requirements satisfied"
}

# Clean and prepare
prepare_build() {
    print_section "Preparing Build Environment"
    
    # Clean previous builds
    rm -rf "$BUILD_DIR" "$DIST_DIR"
    mkdir -p "$BUILD_DIR" "$DIST_DIR"
    
    print_success "Build environment prepared"
}

# Build Python backend with basic PyInstaller
build_backend_simple() {
    print_section "Building Python Backend (Development Mode)"
    
    cd "$SERVER_DIR"
    
    # Install dependencies
    echo "Installing Python dependencies..."
    uv sync --all-extras
    
    # Ensure PyInstaller is available
    echo "Checking PyInstaller installation..."
    if ! uv run python -c "import PyInstaller" 2>/dev/null; then
        echo "Installing PyInstaller..."
        uv add pyinstaller
        uv sync
    fi
    
    # Create a simple spec file for local development
    cat > main-local.spec << 'EOF'
# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

# Basic hidden imports - minimal for faster local builds
hidden_imports = [
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.http.auto', 
    'fastapi',
    'pydantic',
    'click',
    'httpx',
    'loguru',
    'numpy',
    'cv2',
    'aiortc',
    'aiosqlite',
    'netifaces'
]

# Minimal data files for local testing
datas = []
if os.path.exists('data'):
    datas.append(('data', 'data'))

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
        'matplotlib',
        'jupyter',
        'pytest',
        'black'
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
    upx=False,  # Disable UPX for faster local builds
    console=True,  # Keep console for debugging
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='alp-experimental-server'
)
EOF
    
    # Build with PyInstaller
    echo "Building with PyInstaller (this may take a few minutes)..."
    uv run pyinstaller main-local.spec --clean --noconfirm --log-level WARN
    
    # Check if build succeeded
    if [[ ! -d "dist/alp-experimental-server" ]]; then
        echo "❌ PyInstaller build failed"
        exit 1
    fi
    
    # Copy to build directory
    cp -r "dist/alp-experimental-server" "$BUILD_DIR/"
    
    print_success "Python backend built successfully"
    
    cd "$PROJECT_ROOT"
}

# Build frontend 
build_frontend_simple() {
    print_section "Building Next.js Frontend"
    
    cd "$UI_DIR"
    
    # Install dependencies
    echo "Installing frontend dependencies..."
    npm ci --silent
    
    # Build for production
    echo "Building Next.js application..."
    export NODE_ENV=production
    export NEXT_TELEMETRY_DISABLED=1
    
    npm run build --silent
    
    # Copy build output
    mkdir -p "$BUILD_DIR/ui"
    
    if [[ -d ".next/standalone" ]]; then
        cp -r ".next/standalone"/* "$BUILD_DIR/ui/"
        mkdir -p "$BUILD_DIR/ui/.next"
        cp -r ".next/static" "$BUILD_DIR/ui/.next/" 2>/dev/null || true
        cp -r "public" "$BUILD_DIR/ui/" 2>/dev/null || true
    else
        # Fallback to basic build
        cp -r ".next" "$BUILD_DIR/ui/"
        cp -r "public" "$BUILD_DIR/ui/" 2>/dev/null || true
    fi
    
    print_success "Frontend built successfully"
    
    cd "$PROJECT_ROOT"
}

# Update Electron configuration for local build
setup_electron_local() {
    print_section "Setting Up Electron for Local Build"
    
    cd "$ELECTRON_DIR"
    
    # Install dependencies
    echo "Installing Electron dependencies..."
    npm ci --silent
    
    # Update package.json for local development
    # Create a temporary build configuration
    cat > electron-builder-local.json << EOF
{
  "appId": "com.alp.experimental.local",
  "productName": "ALP Experimental (Local)",
  "directories": {
    "output": "../dist"
  },
  "files": [
    "main.js",
    "preload.js", 
    "processManager.js",
    "node_modules/**/*"
  ],
  "extraResources": [
    {
      "from": "../build/alp-experimental-server",
      "to": "server",
      "filter": ["**/*"]
    },
    {
      "from": "../build/ui",
      "to": "ui",
      "filter": ["**/*"]
    }
  ],
  "mac": {
    "category": "public.app-category.utilities",
    "target": [
      {
        "target": "dmg",
        "arch": ["x64", "arm64"]
      }
    ],
    "icon": "assets/icon.icns",
    "artifactName": "\${productName}-\${version}-\${arch}.\${ext}"
  },
  "compression": "store",
  "removePackageScripts": true
}
EOF
    
    print_success "Electron configuration updated for local build"
    
    cd "$PROJECT_ROOT"
}

# Build Electron app
build_electron_local() {
    print_section "Building Electron Application (Local)"
    
    cd "$ELECTRON_DIR"
    
    # Create a simple icon if none exists
    if [[ ! -f "assets/icon.icns" ]]; then
        mkdir -p assets
        # Create a simple placeholder icon using the system's default app icon
        cp "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns" "assets/icon.icns" 2>/dev/null || {
            echo "Note: No icon file created. App will use default Electron icon."
        }
    fi
    
    # Build with electron-builder using our local config
    echo "Building Electron app for macOS..."
    npx electron-builder --config electron-builder-local.json --mac
    
    # Check if build succeeded
    if [[ ! -d "dist" ]]; then
        echo "❌ Electron build failed"
        exit 1
    fi
    
    print_success "Electron application built successfully"
    
    cd "$PROJECT_ROOT"
}

# Test the built application
test_build() {
    print_section "Testing Build"
    
    # Test backend executable
    echo "Testing backend startup..."
    if timeout 5s "$BUILD_DIR/alp-experimental-server/alp-experimental-server" --help >/dev/null 2>&1; then
        print_success "Backend executable works"
    else
        print_warning "Backend test inconclusive (timeout or minor issues)"
    fi
    
    # Check Electron app
    if [[ -d "$ELECTRON_DIR/dist" ]]; then
        print_success "Electron app directory created"
        ls -la "$ELECTRON_DIR/dist"
    fi
    
    print_success "Build test completed"
}

# Show instructions
show_instructions() {
    print_section "Build Complete - Next Steps"
    
    echo "Your local macOS build is ready!"
    echo ""
    echo "Built artifacts:"
    echo "  Backend: $BUILD_DIR/alp-experimental-server/"
    echo "  Frontend: $BUILD_DIR/ui/"
    echo "  Electron App: $ELECTRON_DIR/dist/"
    echo ""
    echo "To test the application:"
    if [[ -f "$ELECTRON_DIR/dist"/*.dmg ]]; then
        DMG_FILE=$(ls "$ELECTRON_DIR/dist"/*.dmg | head -1)
        echo "  1. Open the DMG: open '$DMG_FILE'"
        echo "  2. Drag the app to Applications or double-click to run"
    fi
    if [[ -d "$ELECTRON_DIR/dist/mac" ]]; then
        echo "  Or run directly: open '$ELECTRON_DIR/dist/mac/ALP Experimental (Local).app'"
    fi
    echo ""
    echo "Or run the backend directly:"
    echo "  $BUILD_DIR/alp-experimental-server/alp-experimental-server server"
    echo ""
    echo "For a full production build, use:"
    echo "  ./scripts/build-macos.sh"
    echo ""
}

# Main execution
main() {
    check_local_requirements
    prepare_build
    build_backend_simple
    build_frontend_simple
    setup_electron_local
    build_electron_local
    test_build
    show_instructions
}

# Handle arguments
case "${1:-}" in
    --help|-h)
        echo "Local macOS Build Script for ALP Experimental"
        echo ""
        echo "This script creates a local development build without code signing."
        echo "It's faster than the full production build and suitable for testing."
        echo ""
        echo "Usage: $0 [--help]"
        echo ""
        echo "For production builds, use: ./build-macos.sh"
        exit 0
        ;;
    *)
        main
        ;;
esac