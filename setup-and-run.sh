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

# Check if running on Raspberry Pi and ensure it's 64-bit
if [ -f /etc/os-release ] && grep -qi "raspbian" /etc/os-release; then
    echo -e "\n${YELLOW}Detected Raspberry Pi. Checking architecture...${NC}"
    
    ARCH=$(uname -m)
    if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
        echo -e "${RED}❌ 32-bit Raspberry Pi OS detected!${NC}"
        echo ""
        echo "ALP Experimental requires a 64-bit operating system."
        echo "Your current architecture: $ARCH (32-bit)"
        echo ""
        echo "To use ALP Experimental on Raspberry Pi, you need to:"
        echo "1. Download the 64-bit version of Raspberry Pi OS from:"
        echo "   https://www.raspberrypi.com/software/operating-systems/"
        echo "2. Flash it to your SD card"
        echo "3. Boot from the new 64-bit OS"
        echo ""
        echo "Note: 64-bit OS is required for Docker compatibility and better performance."
        exit 1
    else
        echo -e "${GREEN}✓ 64-bit Raspberry Pi OS detected (${ARCH})${NC}"
    fi
fi

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
$DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml down 2>/dev/null || true

# Start the application
echo -e "\n${YELLOW}Starting ALP Experimental...${NC}"
echo "Pulling pre-built images from GitHub Container Registry..."
echo ""

# Use the ghcr compose file with pre-built images
$DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml pull
$DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml up -d

# Wait for services to be ready
echo -e "\n${YELLOW}Waiting for services to start...${NC}"
sleep 5

# Check if services are running
if $DOCKER_CMD ps | grep -q alp-experimental; then
    echo -e "\n${GREEN}✅ ALP Experimental is running!${NC}"
    echo ""
    
    # Get the host IP address
    if command_exists ip; then
        # Linux with ip command
        HOST_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || echo "")
    elif command_exists ifconfig; then
        # macOS or older Linux with ifconfig
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            HOST_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
        else
            # Linux with ifconfig
            HOST_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | sed 's/addr://')
        fi
    else
        HOST_IP=""
    fi
    
    # If we couldn't get the IP, fall back to localhost
    if [ -z "$HOST_IP" ]; then
        HOST_IP="localhost"
    fi
    
    echo "Access the application at:"
    echo "  - Frontend: http://${HOST_IP}:3000"
    echo "  - Backend API: http://${HOST_IP}:8000"
    echo "  - API Documentation: http://${HOST_IP}:8000/docs"
    
    # Also show localhost for local access
    if [ "$HOST_IP" != "localhost" ]; then
        echo ""
        echo "For local access, you can also use:"
        echo "  - http://localhost:3000"
    fi
    
    echo ""
    echo "To view logs: $DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml logs -f"
    echo "To stop: $DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml down"
    
    # Show logs for 60 seconds
    echo -e "\n${YELLOW}Showing container logs for 60 seconds...${NC}"
    echo "Press Ctrl+C to stop viewing logs and exit."
    echo ""
    timeout 60 $DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml logs -f || true
    
    echo -e "\n${GREEN}Setup complete! The services are running in the background.${NC}"
else
    echo -e "\n${RED}❌ Failed to start services${NC}"
    echo "Check logs with: $DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml logs"
    exit 1
fi
