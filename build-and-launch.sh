#!/bin/bash

# Build and launch ESC Electron app for macOS
# Based on the build-release.yml GitHub Actions workflow

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_status() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Get the script directory (project root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

print_status "Starting ESC build process for macOS"
print_info "Project root: $SCRIPT_DIR"

# Step 1: Check prerequisites
print_status "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 20 or higher."
    exit 1
else
    NODE_VERSION=$(node -v)
    print_info "Node.js version: $NODE_VERSION"
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    print_warning "pnpm is not installed. Installing pnpm..."
    npm install -g pnpm@10
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.12 or higher."
    exit 1
else
    PYTHON_VERSION=$(python3 --version)
    print_info "Python version: $PYTHON_VERSION"
fi

# Step 2: Build Frontend
print_status "Building frontend..."
cd "$SCRIPT_DIR/ui"

if [ ! -d "node_modules" ]; then
    print_info "Installing frontend dependencies..."
    pnpm install --frozen-lockfile
fi

print_status "Building frontend production build..."
pnpm run build

# Check if standalone build was created
if [ ! -d ".next/standalone" ]; then
    print_error "Frontend standalone build not found!"
    exit 1
fi

print_info "Frontend build complete"

# Step 3: Bundle Python with standalone uv
print_status "Bundling Python backend with standalone uv..."
cd "$SCRIPT_DIR"

# Make the script executable
chmod +x scripts/bundle-with-uv-standalone.sh

# Run the bundle script
./scripts/bundle-with-uv-standalone.sh

# Check if Python bundle was created
if [ ! -d "electron/python-bundle" ]; then
    print_error "Python bundle not created!"
    exit 1
fi

# Add build type marker
echo "embedded" > electron/python-bundle/.build-type
print_info "Python bundle created with standalone uv"

# Step 4: Prepare Electron build
print_status "Preparing Electron build..."
cd "$SCRIPT_DIR/electron"

# Install Electron dependencies
if [ ! -d "node_modules" ]; then
    print_info "Installing Electron dependencies..."
    pnpm install --frozen-lockfile
else
    print_info "Electron dependencies already installed"
fi

# Step 5: Build Electron app for macOS
print_status "Building Electron app for macOS..."

# Clean previous builds
if [ -d "dist" ]; then
    print_info "Cleaning previous build artifacts..."
    rm -rf dist
fi

# Run the build
print_status "Running electron-builder for macOS..."
pnpm run build:mac

# Step 6: Check build output
print_status "Checking build output..."

# Find the built app
APP_PATH=""
if [ -d "dist/mac-arm64/ESC.app" ]; then
    APP_PATH="dist/mac-arm64/ESC.app"
elif [ -d "dist/mac/ESC.app" ]; then
    APP_PATH="dist/mac/ESC.app"
fi

if [ -z "$APP_PATH" ]; then
    print_error "Built app not found in expected locations!"
    print_info "Contents of dist directory:"
    ls -la dist/ 2>/dev/null || echo "dist directory not found"
    exit 1
fi

# Check for DMG file
DMG_FILE=$(find dist -name "*.dmg" 2>/dev/null | head -n 1)
if [ -n "$DMG_FILE" ]; then
    print_info "DMG installer created: $DMG_FILE"
fi

# Step 7: Launch the app
print_status "Build complete! Launching the application..."

FULL_APP_PATH="$SCRIPT_DIR/electron/$APP_PATH"
print_info "Launching: $FULL_APP_PATH"

# Launch the app
open "$FULL_APP_PATH"

print_status "✅ Application launched successfully!"
print_info ""
print_info "Build artifacts:"
print_info "  - App: $FULL_APP_PATH"
if [ -n "$DMG_FILE" ]; then
    print_info "  - DMG: $SCRIPT_DIR/electron/$DMG_FILE"
fi
print_info ""
print_info "To distribute the app, use the DMG file."