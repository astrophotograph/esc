#!/bin/bash

# ALP Experimental Server Start Script with Auto-Restart
# This script runs the server and automatically restarts it when requested

echo "Starting ALP Experimental server with auto-restart capability..."

# Default command
COMMAND="uv run python main.py server"

# Add any command line arguments passed to this script
if [ $# -gt 0 ]; then
    COMMAND="$COMMAND $@"
fi

# Function to handle signals
cleanup() {
    echo "Received shutdown signal, stopping server..."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main restart loop
while true; do
    echo "Starting server: $COMMAND"
    $COMMAND
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "Server exited normally (exit code 0)"
        break
    elif [ $EXIT_CODE -eq 1 ]; then
        echo "Server requested restart (exit code 1), restarting in 2 seconds..."
        sleep 2
    else
        echo "Server exited with error code $EXIT_CODE"
        echo "Restarting in 5 seconds... (Press Ctrl+C to stop)"
        sleep 5
    fi
done

echo "Server shutdown complete"