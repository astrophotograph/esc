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
