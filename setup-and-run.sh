#!/bin/bash

# ALP Experimental - Quick Setup and Run Script
# This script checks for Docker, clones/updates the repository, and starts the application

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
REPO_URL="https://github.com/astrophotograph/alp-experimental.git"
REPO_DIR="alp-experimental"
BRANCH="main"

echo -e "${GREEN}ALP Experimental - Setup and Run Script${NC}"
echo "========================================"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for Docker
echo -e "\n${YELLOW}Checking for Docker...${NC}"
if ! command_exists docker; then
    echo -e "${RED}Docker is not installed!${NC}"
    
    # Check if running on Raspberry Pi
    if [ -f /etc/os-release ] && grep -qi "raspbian" /etc/os-release; then
        echo ""
        echo "Detected Raspberry Pi. You can install Docker using:"
        echo -e "${GREEN}sudo apt install docker.io${NC}"
        echo ""
        echo "After installation, add your user to the docker group:"
        echo -e "${GREEN}sudo usermod -aG docker \$USER${NC}"
        echo ""
        echo "Then log out and back in for the group change to take effect."
    else
        echo "Please install Docker from: https://docs.docker.com/get-docker/"
    fi
    
    echo "After installing Docker, run this script again."
    exit 1
fi

# Check for Docker Compose
if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}Docker Compose is not installed!${NC}"
    echo "Please install Docker Compose or update Docker to include Compose."
    exit 1
fi

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1 && ! sudo docker info >/dev/null 2>&1; then
    echo -e "${RED}Docker daemon is not running!${NC}"
    echo "Please start Docker and run this script again."
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed and running${NC}"

# Check if Docker needs sudo
DOCKER_CMD="docker"
DOCKER_COMPOSE_CMD="docker compose"
if ! docker ps >/dev/null 2>&1 && sudo docker ps >/dev/null 2>&1; then
    echo -e "${YELLOW}Docker requires sudo on this system${NC}"
    DOCKER_CMD="sudo docker"
    
    # Check which compose command works with sudo
    if sudo docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="sudo docker compose"
    elif command_exists docker-compose && sudo docker-compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="sudo docker-compose"
    fi
    
    echo -e "${YELLOW}Note: To run Docker without sudo, add your user to the docker group:${NC}"
    echo -e "${GREEN}sudo usermod -aG docker \$USER${NC}"
    echo "Then log out and back in for the change to take effect."
    echo ""
elif ! docker compose version >/dev/null 2>&1 && command_exists docker-compose; then
    DOCKER_COMPOSE_CMD="docker-compose"
fi

# Clone or update repository
echo -e "\n${YELLOW}Setting up repository...${NC}"
if [ -d "$REPO_DIR" ]; then
    echo "Repository already exists. Updating to latest version..."
    cd "$REPO_DIR"
    
    # Stash any local changes
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "Stashing local changes..."
        git stash push -m "Auto-stash before update $(date +%Y%m%d_%H%M%S)"
    fi
    
    # Fetch and pull latest changes
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    echo -e "${GREEN}✓ Repository updated${NC}"
else
    echo "Cloning repository..."
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
    git checkout "$BRANCH"
    echo -e "${GREEN}✓ Repository cloned${NC}"
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "\n${YELLOW}Creating default .env file...${NC}"
    cat > .env << EOF
# Environment Configuration
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF
    echo -e "${GREEN}✓ Created .env file${NC}"
fi

# Stop any running containers
echo -e "\n${YELLOW}Stopping any existing containers...${NC}"
$DOCKER_COMPOSE_CMD down 2>/dev/null || true

# Start the application
echo -e "\n${YELLOW}Starting ALP Experimental...${NC}"
echo "This may take a few minutes on first run while Docker images are built."
echo ""

$DOCKER_COMPOSE_CMD up -d

# Wait for services to be ready
echo -e "\n${YELLOW}Waiting for services to start...${NC}"
sleep 5

# Check if services are running
if $DOCKER_CMD ps | grep -q alp-experimental; then
    echo -e "\n${GREEN}✅ ALP Experimental is running!${NC}"
    echo ""
    echo "Access the application at:"
    echo "  - Frontend: http://localhost:3000"
    echo "  - Backend API: http://localhost:8000"
    echo "  - API Documentation: http://localhost:8000/docs"
    echo ""
    echo "To view logs: $DOCKER_COMPOSE_CMD logs -f"
    echo "To stop: $DOCKER_COMPOSE_CMD down"
else
    echo -e "\n${RED}❌ Failed to start services${NC}"
    echo "Check logs with: $DOCKER_COMPOSE_CMD logs"
    exit 1
fi