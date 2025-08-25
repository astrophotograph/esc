#!/bin/bash

# Build Python server with PyInstaller for cross-platform distribution
# This creates standalone executables that don't require Python to be installed

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
ELECTRON_DIR="$PROJECT_ROOT/electron"
OUTPUT_DIR="$ELECTRON_DIR/python-bundle"

echo "🐍 Building Python server with PyInstaller..."

# Clean and create output directory
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

cd "$SERVER_DIR"

# Clean previous builds
rm -rf build dist *.spec

# Create an optimized spec file
cat > esc-server.spec << 'EOF'
# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

# Add the server directory to path for imports
server_dir = Path.cwd()

a = Analysis(
    ['main.py'],
    pathex=[str(server_dir)],
    binaries=[],
    datas=[
        ('data', 'data'),  # Include catalog data
        ('static', 'static'),  # Include static files if any
        ('templates', 'templates'),  # Include templates if any
    ],
    hiddenimports=[
        'tzlocal',
        'pydash',
        'smarttel',
        'smarttel.seestar',
        'smarttel.seestar.client',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'pydantic',
        'starlette',
        'httpx',
        'anyio',
        'sniffio',
        'click',
        'h11',
        'httptools',
        'uvloop',
        'websockets',
        'watchfiles',
        'python-multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'tkinter',
        'test',
        'tests',
        'pytest',
        'notebook',
        'IPython',
        'jupyterlab',
        'sphinx',
        'docutils',
        'PIL',
        'numpy.distutils',
    ],
    noarchive=False,
    optimize=1,  # Moderate optimization
)

pyz = PYZ(a.pure)

# Platform-specific executable settings
if sys.platform == 'win32':
    exe_name = 'esc-server.exe'
else:
    exe_name = 'esc-server'

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=exe_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,  # Don't strip on Windows
    upx=False,    # Don't use UPX - can cause antivirus issues
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
EOF

echo "📦 Running PyInstaller build..."

# Check if we're in a GitHub Actions environment
if [ -n "$CI" ]; then
    echo "Running in CI environment"
    # In CI, we might not have uv, so try different methods
    if command -v uv &> /dev/null; then
        uv run pyinstaller esc-server.spec --clean --noconfirm
    elif command -v pyinstaller &> /dev/null; then
        pyinstaller esc-server.spec --clean --noconfirm
    else
        # Install PyInstaller if not available
        pip install pyinstaller
        pyinstaller esc-server.spec --clean --noconfirm
    fi
else
    # Local build
    uv run pyinstaller esc-server.spec --clean --noconfirm
fi

# Check if build was successful
if [ "$?" -ne 0 ]; then
    echo "❌ PyInstaller build failed!"
    exit 1
fi

# Copy the executable to the output directory
if [ -f "dist/esc-server.exe" ]; then
    echo "✅ Windows executable built successfully"
    cp dist/esc-server.exe "$OUTPUT_DIR/"
    BINARY_NAME="esc-server.exe"
elif [ -f "dist/esc-server" ]; then
    echo "✅ Unix executable built successfully"
    cp dist/esc-server "$OUTPUT_DIR/"
    chmod +x "$OUTPUT_DIR/esc-server"
    BINARY_NAME="esc-server"
else
    echo "❌ Build output not found!"
    exit 1
fi

# Copy catalog data if it exists
if [ -d "$SERVER_DIR/data" ]; then
    echo "📚 Copying catalog data..."
    cp -r "$SERVER_DIR/data" "$OUTPUT_DIR/"
fi

# Create a marker file to indicate this is a PyInstaller build
echo "pyinstaller" > "$OUTPUT_DIR/.build-type"

echo ""
echo "✅ Python server built successfully!"
echo "📍 Output: $OUTPUT_DIR/$BINARY_NAME"
echo "📏 Size: $(du -h $OUTPUT_DIR/$BINARY_NAME | cut -f1)"
echo ""
echo "The server can be run directly without Python installed:"
echo "  $OUTPUT_DIR/$BINARY_NAME server"