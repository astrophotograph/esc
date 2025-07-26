#!/bin/bash

# ESC (Experimental Scope Creep) - Quick Setup and Run Script
# This script checks for Docker and starts the application using pre-built images
# Handles repository rename from alp-experimental to esc

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REPO_URL="https://github.com/astrophotograph/esc.git"
OLD_REPO_DIR="alp-experimental"
NEW_REPO_DIR="esc"
BRANCH="main"
FORCE_DOWNLOAD=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force-download)
            FORCE_DOWNLOAD=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --force-download    Force download of the repository even if it exists"
            echo "  --help             Show this help message"
            echo ""
            echo "This script will:"
            echo "  - Check for Docker installation"
            echo "  - Rename alp-experimental directory to esc if needed"
            echo "  - Run ESC using pre-built Docker images (no code download required)"
            echo "  - Optionally download the source code with --force-download"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}ESC (Experimental Scope Creep) - Setup and Run Script${NC}"
echo "======================================================"

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

# Check disk space
echo -e "\n${YELLOW}Checking available disk space...${NC}"
AVAILABLE_SPACE=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
REQUIRED_SPACE=5  # Require at least 5GB free space

if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
    echo -e "${RED}❌ Insufficient disk space!${NC}"
    echo "Available: ${AVAILABLE_SPACE}GB"
    echo "Required: ${REQUIRED_SPACE}GB minimum"
    echo ""
    echo "Please free up disk space before continuing."
    echo "You can use 'docker system prune -a' to clean up Docker resources."
    exit 1
else
    echo -e "${GREEN}✓ Sufficient disk space available (${AVAILABLE_SPACE}GB free)${NC}"
fi

# Check if running on Raspberry Pi and ensure it's 64-bit
if [ -f /etc/os-release ] && grep -qi "raspbian" /etc/os-release; then
    echo -e "\n${YELLOW}Detected Raspberry Pi. Checking architecture...${NC}"
    
    ARCH=$(uname -m)
    if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
        echo -e "${RED}❌ 32-bit Raspberry Pi OS detected!${NC}"
        echo ""
        echo "ESC requires a 64-bit operating system."
        echo "Your current architecture: $ARCH (32-bit)"
        echo ""
        echo "To use ESC on Raspberry Pi, you need to:"
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

# Handle directory rename from alp-experimental to esc
echo -e "\n${YELLOW}Checking for repository directories...${NC}"
RENAMED=false
if [ -d "$OLD_REPO_DIR" ] && [ ! -d "$NEW_REPO_DIR" ]; then
    echo -e "${BLUE}Found 'alp-experimental' directory. Renaming to 'esc' to match new repository name...${NC}"
    mv "$OLD_REPO_DIR" "$NEW_REPO_DIR"
    RENAMED=true
    echo -e "${GREEN}✓ Renamed directory from 'alp-experimental' to 'esc'${NC}"
fi

# Handle repository/source code
if [ "$FORCE_DOWNLOAD" = true ]; then
    echo -e "\n${YELLOW}Force download requested. Setting up repository...${NC}"
    
    # Remove existing directory if force download is requested
    if [ -d "$NEW_REPO_DIR" ]; then
        echo "Removing existing repository directory..."
        rm -rf "$NEW_REPO_DIR"
    fi
    
    echo "Cloning repository..."
    git clone "$REPO_URL" "$NEW_REPO_DIR"
    cd "$NEW_REPO_DIR"
    git checkout "$BRANCH"
    echo -e "${GREEN}✓ Repository cloned${NC}"
else
    # Check if repository exists
    if [ -d "$NEW_REPO_DIR" ]; then
        echo -e "\n${YELLOW}Source code directory exists.${NC}"
        cd "$NEW_REPO_DIR"
        
        # Only try to update if it's a git repository
        if [ -d ".git" ]; then
            echo "Updating to latest version..."
            
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
            echo -e "${YELLOW}Note: Directory exists but is not a git repository. Proceeding with existing files.${NC}"
        fi
    else
        echo -e "\n${BLUE}No source code directory found.${NC}"
        echo "The application will run using pre-built Docker images."
        echo "Use --force-download if you want to download the source code."
        
        # Create a minimal working directory
        mkdir -p "$NEW_REPO_DIR"
        cd "$NEW_REPO_DIR"
    fi
fi

# Create docker-compose.ghcr.yml if it doesn't exist
if [ ! -f docker-compose.ghcr.yml ]; then
    echo -e "\n${YELLOW}Creating docker-compose.ghcr.yml...${NC}"
    cat > docker-compose.ghcr.yml << 'EOF'
version: '3.8'

services:
  ui:
    image: ghcr.io/astrophotograph/esc-ui:latest
    container_name: esc-ui
    environment:
      - NODE_ENV=production
      - BACKEND_URL=http://localhost:8000
    depends_on:
      - server
    restart: unless-stopped
    network_mode: host

  server:
    image: ghcr.io/astrophotograph/esc-server:latest
    container_name: esc-server
    environment:
      - PYTHONUNBUFFERED=1
    volumes:
      - telescope-data:/app/data
    restart: unless-stopped
    network_mode: host

  redis:
    image: redis:7-alpine
    container_name: esc-redis
    network_mode: host
    volumes:
      - redis-data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes

volumes:
  redis-data:
    driver: local
  telescope-data:
    driver: local
EOF
    echo -e "${GREEN}✓ Created docker-compose.ghcr.yml${NC}"
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

# Clean up Docker resources
echo -e "\n${YELLOW}Cleaning up Docker resources...${NC}"
$DOCKER_CMD system prune -f --volumes 2>/dev/null || true
echo -e "${GREEN}✓ Docker cleanup completed${NC}"

# Start the application
echo -e "\n${YELLOW}Starting ESC...${NC}"
echo "Pulling pre-built images from GitHub Container Registry..."
echo ""

# Use the ghcr compose file with pre-built images
$DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml pull
$DOCKER_COMPOSE_CMD -f docker-compose.ghcr.yml up -d

# Wait for services to be ready
echo -e "\n${YELLOW}Waiting for services to start...${NC}"
sleep 5

# Check if services are running
if $DOCKER_CMD ps | grep -q esc; then
    echo -e "\n${GREEN}✅ ESC is running!${NC}"
    
    # Show rename notice if applicable
    if [ "$RENAMED" = true ]; then
        echo -e "\n${BLUE}Note: The 'alp-experimental' directory has been renamed to 'esc' to match the new repository name.${NC}"
    fi
    
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