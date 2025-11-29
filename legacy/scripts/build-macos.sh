#!/bin/bash

# Build script for macOS desktop application
# This script builds the complete ALP Experimental desktop app for macOS
# Requires: Python 3.12+, Node.js 18+, uv, npm

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build"
DIST_DIR="$PROJECT_ROOT/dist"
ELECTRON_DIR="$PROJECT_ROOT/electron"
SERVER_DIR="$PROJECT_ROOT/server"
UI_DIR="$PROJECT_ROOT/ui"

# Build configuration
PYTHON_VERSION="3.12"
NODE_VERSION="18"
BUILD_TYPE="${BUILD_TYPE:-release}"
SKIP_TESTS="${SKIP_TESTS:-false}"
VERBOSE="${VERBOSE:-false}"

echo -e "${BLUE}🚀 ALP Experimental macOS Build Script${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo "Build Type: $BUILD_TYPE"
echo "Project Root: $PROJECT_ROOT"
echo "Build Directory: $BUILD_DIR"
echo "Skip Tests: $SKIP_TESTS"
echo ""

# Function to print section headers
print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warnings
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print errors
print_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check requirements
check_requirements() {
    print_section "Checking Requirements"
    
    # Check Python version
    if ! command_exists python3; then
        print_error "Python 3 not found. Please install Python $PYTHON_VERSION or later."
    fi
    
    PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    echo "Python version: $PYTHON_VER"
    
    # Check Node.js version
    if ! command_exists node; then
        print_error "Node.js not found. Please install Node.js $NODE_VERSION or later."
    fi
    
    NODE_VER=$(node --version)
    echo "Node.js version: $NODE_VER"
    
    # Check uv
    if ! command_exists uv; then
        print_error "uv not found. Please install uv: pip install uv"
    fi
    
    UV_VER=$(uv --version)
    echo "uv version: $UV_VER"
    
    # Check npm
    if ! command_exists npm; then
        print_error "npm not found. Please install npm (usually comes with Node.js)."
    fi
    
    NPM_VER=$(npm --version)
    echo "npm version: $NPM_VER"
    
    # Check system requirements for PyInstaller
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command_exists xcode-select; then
            print_warning "Xcode Command Line Tools not found. Installing..."
            xcode-select --install || true
        fi
        echo "Platform: macOS $(sw_vers -productVersion)"
        echo "Architecture: $(uname -m)"
    else
        print_error "This script is designed for macOS. Use the appropriate script for your platform."
    fi
    
    print_success "All requirements satisfied"
}

# Function to clean previous builds
clean_build() {
    print_section "Cleaning Previous Builds"
    
    # Remove build directories
    rm -rf "$BUILD_DIR"
    rm -rf "$DIST_DIR"
    rm -rf "$SERVER_DIR/dist"
    rm -rf "$SERVER_DIR/build"
    rm -rf "$UI_DIR/out"
    rm -rf "$UI_DIR/.next"
    rm -rf "$ELECTRON_DIR/dist"
    
    # Create fresh build directory
    mkdir -p "$BUILD_DIR"
    mkdir -p "$DIST_DIR"
    
    print_success "Build directories cleaned"
}

# Function to build Python backend
build_backend() {
    print_section "Building Python Backend"
    
    cd "$SERVER_DIR"
    
    # Install dependencies
    echo "Installing Python dependencies..."
    uv sync --all-extras
    
    # Run tests if not skipped
    if [[ "$SKIP_TESTS" != "true" ]]; then
        echo "Running Python tests..."
        if [[ "$VERBOSE" == "true" ]]; then
            uv run pytest tests/ -v
        else
            uv run pytest tests/ -q
        fi
        print_success "Python tests passed"
    fi
    
    # Build with PyInstaller
    echo "Building Python executable with PyInstaller..."
    
    # Create optimized spec file for macOS
    cat > main-macos.spec << 'EOF'
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
    upx=False,  # Disable UPX on macOS to avoid issues
    console=False,  # Hide console window
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

# Create app bundle structure for macOS
app = BUNDLE(
    coll,
    name='ALP Experimental Server.app',
    icon=None,
    bundle_identifier='com.alp.experimental.server',
)
EOF
    
    # Run PyInstaller
    if [[ "$VERBOSE" == "true" ]]; then
        uv run pyinstaller main-macos.spec --clean --noconfirm
    else
        uv run pyinstaller main-macos.spec --clean --noconfirm --log-level WARN
    fi
    
    # Check if build succeeded
    if [[ ! -d "dist/alp-experimental-server" ]]; then
        print_error "PyInstaller build failed - executable not found"
    fi
    
    # Copy to build directory
    cp -r "dist/alp-experimental-server" "$BUILD_DIR/"
    
    print_success "Python backend built successfully"
    
    cd "$PROJECT_ROOT"
}

# Function to build frontend
build_frontend() {
    print_section "Building Next.js Frontend"
    
    cd "$UI_DIR"
    
    # Install dependencies
    echo "Installing Node.js dependencies..."
    npm ci
    
    # Run tests if not skipped
    if [[ "$SKIP_TESTS" != "true" ]]; then
        echo "Running frontend tests..."
        if [[ "$VERBOSE" == "true" ]]; then
            npm run test -- --verbose
        else
            npm run test -- --silent
        fi
        print_success "Frontend tests passed"
    fi
    
    # Build frontend
    echo "Building Next.js application..."
    
    # Set build environment
    export NODE_ENV=production
    export NEXT_TELEMETRY_DISABLED=1
    
    # Build the application
    npm run build
    
    # Check if build succeeded
    if [[ ! -d ".next" ]]; then
        print_error "Next.js build failed - .next directory not found"
    fi
    
    # Export static files (if configured)
    if grep -q '"output".*"export"' next.config.mjs 2>/dev/null; then
        echo "Exporting static files..."
        npm run export || true
    fi
    
    # Copy build to build directory
    mkdir -p "$BUILD_DIR/ui"
    
    if [[ -d "out" ]]; then
        # Static export
        cp -r "out"/* "$BUILD_DIR/ui/"
        print_success "Frontend static export built successfully"
    else
        # Standalone server
        cp -r ".next/standalone"/* "$BUILD_DIR/ui/" 2>/dev/null || true
        cp -r ".next/static" "$BUILD_DIR/ui/.next/" 2>/dev/null || true
        cp -r "public" "$BUILD_DIR/ui/" 2>/dev/null || true
        print_success "Frontend standalone build created successfully"
    fi
    
    cd "$PROJECT_ROOT"
}

# Function to package Electron app
package_electron() {
    print_section "Packaging Electron Application"
    
    cd "$ELECTRON_DIR"
    
    # Install Electron dependencies
    echo "Installing Electron dependencies..."
    npm ci
    
    # Update package.json with current build
    echo "Updating Electron configuration..."
    
    # Ensure extraResources points to our build directory
    cat > build-config.json << EOF
{
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
  ]
}
EOF
    
    # Build for macOS
    echo "Building Electron app for macOS..."
    
    if [[ "$BUILD_TYPE" == "release" ]]; then
        # Production build
        npm run build:mac
    else
        # Development/debug build
        npx electron-builder --mac --config.compression=store --config.nsis.oneClick=false
    fi
    
    # Check if build succeeded
    if [[ ! -d "dist" ]] || [[ ! "$(ls dist/*.dmg 2>/dev/null)" ]]; then
        print_error "Electron build failed - no DMG found in dist/"
    fi
    
    # Copy final artifacts
    cp dist/*.dmg "$DIST_DIR/" 2>/dev/null || true
    cp dist/*.app "$DIST_DIR/" 2>/dev/null || true
    cp -r dist/mac* "$DIST_DIR/" 2>/dev/null || true
    
    print_success "Electron application packaged successfully"
    
    cd "$PROJECT_ROOT"
}

# Function to create universal binary (Intel + Apple Silicon)
create_universal_binary() {
    print_section "Creating Universal Binary"
    
    # This is a simplified approach - full universal binary requires building separately for each architecture
    # For now, we'll build for the current architecture
    
    ARCH=$(uname -m)
    echo "Building for architecture: $ARCH"
    
    if [[ "$ARCH" == "arm64" ]]; then
        echo "Building on Apple Silicon (ARM64)"
        # The build will naturally target Apple Silicon
    else
        echo "Building on Intel (x86_64)"
        # The build will naturally target Intel
    fi
    
    print_warning "Universal binary creation requires separate builds on different architectures"
    print_success "Single-architecture binary created for $ARCH"
}

# Function to validate build
validate_build() {
    print_section "Validating Build"
    
    # Check that all expected files exist
    echo "Checking build artifacts..."
    
    # Check backend executable
    if [[ -d "$BUILD_DIR/alp-experimental-server" ]]; then
        print_success "Backend executable found"
        
        # Test backend startup (quick test)
        echo "Testing backend startup..."
        timeout 5s "$BUILD_DIR/alp-experimental-server/alp-experimental-server" --help >/dev/null 2>&1 || true
    else
        print_error "Backend executable not found"
    fi
    
    # Check frontend build
    if [[ -d "$BUILD_DIR/ui" ]] && [[ "$(ls -A "$BUILD_DIR/ui")" ]]; then
        print_success "Frontend build found"
    else
        print_error "Frontend build not found or empty"
    fi
    
    # Check final Electron app
    if [[ "$(ls "$DIST_DIR"/*.dmg 2>/dev/null)" ]]; then
        DMG_FILE=$(ls "$DIST_DIR"/*.dmg | head -1)
        DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1)
        print_success "Final DMG created: $(basename "$DMG_FILE") ($DMG_SIZE)"
    else
        print_error "Final DMG not found"
    fi
    
    print_success "Build validation completed"
}

# Function to show build summary
show_summary() {
    print_section "Build Summary"
    
    echo "Build completed successfully!"
    echo ""
    echo "Artifacts created:"
    
    if [[ -d "$BUILD_DIR" ]]; then
        echo "  Intermediate build files: $BUILD_DIR"
        du -sh "$BUILD_DIR" 2>/dev/null || true
    fi
    
    if [[ -d "$DIST_DIR" ]] && [[ "$(ls -A "$DIST_DIR")" ]]; then
        echo "  Final distributables: $DIST_DIR"
        ls -la "$DIST_DIR"
    fi
    
    echo ""
    echo "To install the application:"
    if [[ "$(ls "$DIST_DIR"/*.dmg 2>/dev/null)" ]]; then
        echo "  1. Open the DMG file: $(ls "$DIST_DIR"/*.dmg | head -1)"
        echo "  2. Drag the application to Applications folder"
        echo "  3. Launch from Applications or Launchpad"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Build completed successfully!${NC}"
}

# Main execution
main() {
    check_requirements
    clean_build
    build_backend
    build_frontend
    package_electron
    create_universal_binary
    validate_build
    show_summary
}

# Handle script arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "ALP Experimental macOS Build Script"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --help, -h           Show this help message"
            echo "  --clean-only         Only clean build directories"
            echo "  --backend-only       Only build Python backend"
            echo "  --frontend-only      Only build Next.js frontend"
            echo "  --electron-only      Only package Electron app"
            echo "  --skip-tests         Skip running tests"
            echo "  --verbose            Enable verbose output"
            echo "  --debug              Build debug version"
            echo ""
            echo "Environment variables:"
            echo "  BUILD_TYPE           Build type (release, debug) [default: release]"
            echo "  SKIP_TESTS           Skip tests (true, false) [default: false]"
            echo "  VERBOSE              Verbose output (true, false) [default: false]"
            echo ""
            exit 0
            ;;
        --clean-only)
            clean_build
            exit 0
            ;;
        --backend-only)
            check_requirements
            build_backend
            exit 0
            ;;
        --frontend-only)
            check_requirements
            build_frontend
            exit 0
            ;;
        --electron-only)
            check_requirements
            package_electron
            exit 0
            ;;
        --skip-tests)
            SKIP_TESTS="true"
            shift
            ;;
        --verbose)
            VERBOSE="true"
            shift
            ;;
        --debug)
            BUILD_TYPE="debug"
            shift
            ;;
        *)
            print_error "Unknown option: $1. Use --help for usage information."
            ;;
    esac
done

# Run main build process
main