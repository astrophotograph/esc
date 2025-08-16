#!/bin/bash
# Restart script for Docker containers using docker-compose.ghcr.yml

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Check if docker requires sudo
DOCKER_CMD="docker"
if ! docker ps >/dev/null 2>&1; then
    if sudo docker ps >/dev/null 2>&1; then
        DOCKER_CMD="sudo docker"
        echo "Using sudo for docker commands..."
    else
        echo "Error: Cannot access Docker. Make sure Docker is installed and running."
        echo "You may need to add your user to the docker group or use sudo."
        exit 1
    fi
fi

# Determine the correct docker-compose command
if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="${DOCKER_CMD}-compose"
elif $DOCKER_CMD compose version >/dev/null 2>&1; then
    COMPOSE_CMD="$DOCKER_CMD compose"
else
    echo "Error: docker-compose not found. Please install docker-compose."
    exit 1
fi

echo "Working directory: $SCRIPT_DIR"
echo "Using compose command: $COMPOSE_CMD"
echo ""
echo "Restarting Docker containers..."

# Stop existing containers
echo "Stopping containers..."
$COMPOSE_CMD -f docker-compose.ghcr.yml down

# Start containers again
echo "Starting containers..."
$COMPOSE_CMD -f docker-compose.ghcr.yml up -d

# Show status
echo ""
echo "Containers restarted. Current status:"
$COMPOSE_CMD -f docker-compose.ghcr.yml ps

echo ""
echo "To view logs, run: $COMPOSE_CMD -f docker-compose.ghcr.yml logs -f"