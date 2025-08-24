#!/bin/bash

# Bundle Python server source code for Electron app
# This copies the Python source and creates a requirements file

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$PROJECT_ROOT/server"
ELECTRON_DIR="$PROJECT_ROOT/electron"
BUNDLE_DIR="$ELECTRON_DIR/python-bundle"

echo "Bundling Python server for Electron..."

# Clean and create bundle directory
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# Copy Python source files
echo "Copying Python source files..."
cp -r "$SERVER_DIR"/*.py "$BUNDLE_DIR/"
cp -r "$SERVER_DIR"/api "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/models "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/services "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/smarttel "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/cli "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/lib "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/pyproject.toml "$BUNDLE_DIR/" 2>/dev/null || true

# Generate requirements file from uv
echo "Generating requirements.txt..."
cd "$SERVER_DIR"
uv pip compile pyproject.toml -o "$BUNDLE_DIR/requirements.txt" 2>/dev/null || \
  uv pip freeze > "$BUNDLE_DIR/requirements.txt"

# Create a simple launcher script
cat > "$BUNDLE_DIR/launch.sh" << 'EOF'
#!/bin/bash
# Launcher script for Python server

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if virtual environment exists
if [ ! -d "$DIR/.venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$DIR/.venv"
    
    echo "Installing dependencies..."
    "$DIR/.venv/bin/pip" install --upgrade pip
    "$DIR/.venv/bin/pip" install -r "$DIR/requirements.txt"
fi

# Run the server
"$DIR/.venv/bin/python" "$DIR/main.py" "$@"
EOF

chmod +x "$BUNDLE_DIR/launch.sh"

echo "Python bundle created at: $BUNDLE_DIR"
echo ""
echo "To use this bundle:"
echo "1. Include python-bundle/ in your Electron build"
echo "2. On first run, it will create a virtual environment and install dependencies"
echo "3. Run with: ./python-bundle/launch.sh server"