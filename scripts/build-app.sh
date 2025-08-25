#!/bin/bash

# Build script for ESC Electron app
# This script builds the complete application for distribution

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."

echo "🚀 Building ESC Application..."

# Step 1: Build the frontend
echo "📦 Building frontend..."
cd "$PROJECT_ROOT/ui"
pnpm install --frozen-lockfile
pnpm run build

# Step 2: Bundle Python backend
echo "🐍 Bundling Python backend..."
cd "$PROJECT_ROOT"
./scripts/bundle-python.sh

# Step 3: Copy catalog data to bundle
echo "📚 Copying catalog data..."
if [ -d "$PROJECT_ROOT/server/data" ]; then
    cp -r "$PROJECT_ROOT/server/data" "$PROJECT_ROOT/electron/python-bundle/"
else
    echo "⚠️  Warning: Catalog data not found at server/data"
fi

# Step 4: Build Electron app
echo "⚡ Building Electron app..."
cd "$PROJECT_ROOT/electron"
pnpm install --frozen-lockfile

# Check which platform to build for
PLATFORM=${1:-current}

case "$PLATFORM" in
    mac)
        echo "🍎 Building for macOS..."
        pnpm run build:mac
        ;;
    win)
        echo "🪟 Building for Windows..."
        pnpm run build:win
        ;;
    linux)
        echo "🐧 Building for Linux..."
        pnpm run build:linux
        ;;
    all)
        echo "🌍 Building for all platforms..."
        pnpm run dist:all
        ;;
    current)
        echo "💻 Building for current platform..."
        pnpm run build
        ;;
    *)
        echo "❌ Unknown platform: $PLATFORM"
        echo "Usage: $0 [mac|win|linux|all|current]"
        exit 1
        ;;
esac

echo "✅ Build complete! Check electron/dist/ for the output."