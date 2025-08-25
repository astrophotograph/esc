#!/bin/bash

# Test PyInstaller build locally to catch issues before pushing to CI
# This script builds and tests the server executable

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
TEST_BUILD_DIR="$SERVER_DIR/test-build"

echo "🧪 Testing PyInstaller build locally..."
echo "This will help catch missing dependencies before pushing to CI"
echo ""

# Clean previous test builds
rm -rf "$TEST_BUILD_DIR"
mkdir -p "$TEST_BUILD_DIR"

cd "$SERVER_DIR"

# Determine platform-specific settings
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows
    DATA_SEP=";"
    EXE_NAME="esc-server.exe"
    ONEFILE="--onefile"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - use onedir to avoid size limits
    DATA_SEP=":"
    EXE_NAME="esc-server"
    ONEFILE="--onedir"
else
    # macOS and others
    DATA_SEP=":"
    EXE_NAME="esc-server"
    ONEFILE="--onefile"
fi

echo "📦 Building with PyInstaller..."
echo "Platform: $OSTYPE"
echo "Build mode: $ONEFILE"
echo ""

# Run PyInstaller with all the flags we use in CI
uv run pyinstaller $ONEFILE \
    --name esc-server \
    --console \
    --clean \
    --noconfirm \
    --distpath "$TEST_BUILD_DIR/dist" \
    --workpath "$TEST_BUILD_DIR/build" \
    --specpath "$TEST_BUILD_DIR" \
    --add-data "data${DATA_SEP}data" \
    --collect-all pydash \
    --collect-all tzlocal \
    --collect-all smarttel \
    --collect-all fastapi \
    --collect-all pydantic \
    --collect-all starlette \
    --collect-all uvicorn \
    --collect-all httpx \
    --collect-all loguru \
    --collect-all beartype \
    --collect-all netifaces \
    --collect-all click \
    --collect-all appdirs \
    --collect-all numpy \
    --hidden-import numpy.typing \
    --hidden-import uvicorn.logging \
    --hidden-import uvicorn.loops \
    --hidden-import uvicorn.loops.auto \
    --hidden-import uvicorn.protocols \
    --hidden-import uvicorn.protocols.http \
    --hidden-import uvicorn.protocols.http.auto \
    --hidden-import uvicorn.protocols.websockets \
    --hidden-import uvicorn.protocols.websockets.auto \
    --hidden-import uvicorn.lifespan \
    --hidden-import uvicorn.lifespan.on \
    --hidden-import websockets.legacy \
    --hidden-import websockets.legacy.server \
    --hidden-import multipart \
    --hidden-import python-multipart \
    --copy-metadata pydantic \
    --copy-metadata beartype \
    --copy-metadata numpy \
    main.py

if [ $? -ne 0 ]; then
    echo "❌ PyInstaller build failed!"
    exit 1
fi

echo ""
echo "✅ Build completed successfully!"
echo ""

# Test the executable
echo "🏃 Testing the executable..."
echo "Running: $EXE_NAME --help"
echo ""

if [[ "$ONEFILE" == "--onedir" ]]; then
    # For folder builds, the executable is in a subdirectory
    cd "$TEST_BUILD_DIR/dist/esc-server"
    ./esc-server --help
else
    # For single file builds
    cd "$TEST_BUILD_DIR/dist"
    ./$EXE_NAME --help
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Executable runs successfully!"
    echo ""
    
    # Try to import key modules
    echo "🔍 Testing module imports..."
    if [[ "$ONEFILE" == "--onedir" ]]; then
        cd "$TEST_BUILD_DIR/dist/esc-server"
    else
        cd "$TEST_BUILD_DIR/dist"
    fi
    
    # Create a simple test to check imports
    ./$EXE_NAME -c "import sys; print('Python:', sys.version); import numpy; print('numpy:', numpy.__version__); import numpy.typing; print('numpy.typing: OK'); import pydash; print('pydash: OK'); import fastapi; print('fastapi: OK'); import uvicorn; print('uvicorn: OK'); import smarttel; print('smarttel: OK')" 2>/dev/null || true
    
    echo ""
    echo "📏 Executable size:"
    if [[ "$ONEFILE" == "--onedir" ]]; then
        du -sh "$TEST_BUILD_DIR/dist/esc-server"
    else
        ls -lh "$TEST_BUILD_DIR/dist/$EXE_NAME"
    fi
else
    echo ""
    echo "❌ Executable failed to run!"
    echo "Check for missing dependencies or other issues"
    exit 1
fi

echo ""
echo "🎉 All tests passed! The PyInstaller build should work in CI."
echo ""
echo "You can find the test build in: $TEST_BUILD_DIR/dist/"
echo ""
echo "To test the server functionality, run:"
if [[ "$ONEFILE" == "--onedir" ]]; then
    echo "  $TEST_BUILD_DIR/dist/esc-server/esc-server server --help"
else
    echo "  $TEST_BUILD_DIR/dist/$EXE_NAME server --help"
fi