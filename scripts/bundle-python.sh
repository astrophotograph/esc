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
cp -r "$SERVER_DIR"/cli "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/config "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/controllers "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/core "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/exceptions "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/graxpert "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/lib "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/middleware "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/models "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/services "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/smarttel "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/static "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/templates "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/tests "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/utils "$BUNDLE_DIR/" 2>/dev/null || true
cp -r "$SERVER_DIR"/validators "$BUNDLE_DIR/" 2>/dev/null || true
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
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Determine writable directory for virtual environment
if [[ "$SCRIPT_DIR" == *".app/Contents/Resources"* ]]; then
    # Running from macOS app bundle - use Application Support
    VENV_BASE="$HOME/Library/Application Support/ESC"
    mkdir -p "$VENV_BASE"
    VENV_DIR="$VENV_BASE/.venv"
else
    # Development or other environment - use local directory
    VENV_DIR="$SCRIPT_DIR/.venv"
fi

# Check if virtual environment exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment in $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
    
    echo "Installing dependencies..."
    "$VENV_DIR/bin/pip" install --upgrade pip
    "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
fi

# Run the server with the script directory as working directory
cd "$SCRIPT_DIR"
"$VENV_DIR/bin/python" "$SCRIPT_DIR/main.py" "$@"
EOF

chmod +x "$BUNDLE_DIR/launch.sh"

echo "Python bundle created at: $BUNDLE_DIR"
echo ""
echo "To use this bundle:"
echo "1. Include python-bundle/ in your Electron build"
echo "2. On first run, it will create a virtual environment and install dependencies"
echo "3. Run with: ./python-bundle/launch.sh server"