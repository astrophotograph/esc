#!/bin/bash

# Quick script to rebuild just the Electron app with proper macOS bundle

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ELECTRON_DIR="$PROJECT_ROOT/electron"
BUILD_DIR="$PROJECT_ROOT/build"

echo "🔄 Rebuilding Electron app with proper macOS bundle..."

cd "$ELECTRON_DIR"

# Clean previous Electron build
rm -rf dist/

# Create proper electron-builder config for macOS app bundle
cat > electron-builder-local.json << EOF
{
  "appId": "com.alp.experimental.local",
  "productName": "ALP Experimental",
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
        "target": "dir"
      }
    ],
    "icon": "assets/icon.icns"
  },
  "compression": "store"
}
EOF

# Build proper app bundle
echo "Building macOS app bundle..."
npx electron-builder --config electron-builder-local.json --mac --dir

if [[ -d "dist/mac/ALP Experimental.app" ]]; then
    echo "✅ Success! App bundle created at:"
    echo "   $ELECTRON_DIR/dist/mac/ALP Experimental.app"
    echo ""
    echo "To run: open '$ELECTRON_DIR/dist/mac/ALP Experimental.app'"
else
    echo "❌ App bundle creation failed"
    exit 1
fi