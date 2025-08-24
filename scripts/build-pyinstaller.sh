#!/bin/bash

# Build Python server with PyInstaller for Electron distribution
# This creates a smaller, optimized build compared to default

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
ELECTRON_DIR="$PROJECT_ROOT/electron"

echo "Building Python server with PyInstaller (optimized)..."

cd "$SERVER_DIR"

# Clean previous builds
rm -rf build dist *.spec

# Create a spec file for better control
cat > esc-server.spec << 'EOF'
# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'tzlocal',
        'pydash',
        'smarttel',
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
    ],
    noarchive=False,
    optimize=2,  # Optimize bytecode
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='esc-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,  # Strip symbols on Unix
    upx=True,    # Compress with UPX if available
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
EOF

# Build with PyInstaller using the spec file
echo "Running PyInstaller build..."
uv run pyinstaller esc-server.spec --clean

if [ -f "dist/esc-server" ]; then
    echo "Build successful!"
    echo "Binary size: $(du -h dist/esc-server | cut -f1)"
    
    # Copy to electron resources
    DEST_DIR="$ELECTRON_DIR/python-server-dist"
    mkdir -p "$DEST_DIR"
    cp dist/esc-server "$DEST_DIR/"
    
    # Make it executable
    chmod +x "$DEST_DIR/esc-server"
    
    echo "Binary copied to: $DEST_DIR/esc-server"
else
    echo "Build failed!"
    exit 1
fi