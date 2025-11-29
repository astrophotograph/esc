#!/bin/bash

# Auto-respawn script for Next.js server (Unix/Linux/macOS)
# Usage: ./scripts/respawn.sh [dev|start|build-start]

COMMAND=${1:-dev}
MAX_RETRIES=10
RETRY_DELAY=3
RETRY_COUNT=0

echo "🚀 Starting respawn manager for: npm run $COMMAND"
echo "   Max retries: $MAX_RETRIES"
echo "   Retry delay: ${RETRY_DELAY}s"
echo "   Press Ctrl+C twice to exit"
echo ""

# Trap SIGINT for graceful shutdown
SIGINT_COUNT=0
trap 'handle_sigint' INT

handle_sigint() {
    SIGINT_COUNT=$((SIGINT_COUNT + 1))
    if [ $SIGINT_COUNT -eq 1 ]; then
        echo ""
        echo "⚠️ Press Ctrl+C again to exit..."
        sleep 2
        SIGINT_COUNT=0
    else
        echo ""
        echo "👋 Shutting down respawn manager..."
        exit 0
    fi
}

# Main respawn loop
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "🔄 Starting server (attempt $RETRY_COUNT/$MAX_RETRIES)..."
    
    # Run the command
    if [ "$COMMAND" = "build-start" ]; then
        npm run build && npm run start
    else
        npm run "$COMMAND"
    fi
    
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Server exited normally"
        RETRY_COUNT=0  # Reset counter on normal exit
    elif [ $EXIT_CODE -eq 130 ]; then
        echo "🛑 Server was terminated by user"
        exit 0
    else
        echo "⚠️ Server crashed with code $EXIT_CODE"
        echo "   Restarting in ${RETRY_DELAY} seconds..."
        sleep $RETRY_DELAY
    fi
done

echo "❌ Server crashed $MAX_RETRIES times. Giving up."
echo "   Please check the logs and fix the issue."
exit 1