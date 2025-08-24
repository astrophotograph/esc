#!/bin/bash

# Complete build script for ESC Electron app
# This builds the Python server, Next.js frontend, and packages with Electron

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
UI_DIR="$PROJECT_ROOT/ui"
ELECTRON_DIR="$PROJECT_ROOT/electron"

echo "========================================="
echo "ESC Electron App Build Script"
echo "========================================="

# Step 1: Build Python server with PyInstaller
echo ""
echo "Step 1: Building Python server..."
echo "---------------------------------"

if [ -f "$SERVER_DIR/dist/esc-server" ]; then
    echo "PyInstaller build already exists. Size: $(du -h $SERVER_DIR/dist/esc-server | cut -f1)"
    read -p "Rebuild? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        "$SCRIPT_DIR/build-pyinstaller.sh"
    else
        # Copy existing build
        mkdir -p "$ELECTRON_DIR/python-server-dist"
        cp "$SERVER_DIR/dist/esc-server" "$ELECTRON_DIR/python-server-dist/"
        chmod +x "$ELECTRON_DIR/python-server-dist/esc-server"
    fi
else
    "$SCRIPT_DIR/build-pyinstaller.sh"
fi

# Step 2: Build Next.js frontend
echo ""
echo "Step 2: Building Next.js frontend..."
echo "------------------------------------"

cd "$UI_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    pnpm install
fi

# Build the frontend in standalone mode
echo "Building frontend..."
pnpm run build

# Verify the build
if [ ! -d ".next/standalone" ]; then
    echo "Error: Frontend build failed - no standalone output"
    exit 1
fi

echo "Frontend build complete"

# Step 3: Install Electron dependencies
echo ""
echo "Step 3: Installing Electron dependencies..."
echo "-------------------------------------------"

cd "$ELECTRON_DIR"

if [ ! -d "node_modules" ]; then
    echo "Installing Electron dependencies..."
    npm install
fi

# Step 4: Package with Electron Builder
echo ""
echo "Step 4: Packaging Electron app..."
echo "----------------------------------"

# Clean previous builds
rm -rf dist/

# Run electron-builder
npm run build:local

# Step 5: Verify the build
echo ""
echo "Step 5: Verifying build..."
echo "--------------------------"

if [ -d "dist/mac-arm64" ] || [ -d "dist/mac" ] || [ -d "dist/mac-x64" ]; then
    echo "✅ Build successful!"
    echo ""
    echo "Build output:"
    ls -la dist/
    echo ""
    echo "To run the app:"
    if [ -d "dist/mac-arm64" ]; then
        echo "  open dist/mac-arm64/ESC.app"
    elif [ -d "dist/mac" ]; then
        echo "  open dist/mac/ESC.app"
    elif [ -d "dist/mac-x64" ]; then
        echo "  open dist/mac-x64/ESC.app"
    fi
else
    echo "❌ Build failed - no output directory found"
    exit 1
fi

echo ""
echo "========================================="
echo "Build complete!"
echo "========================================="