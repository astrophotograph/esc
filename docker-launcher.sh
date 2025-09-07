#!/bin/bash

# ESC Docker Launcher Script
# Similar to Electron launcher but for Docker deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
MONITOR_COMPOSE_FILE="docker-compose.monitor.yml"
LOG_DIR="./logs"
MONITOR_URL="http://localhost:3001"
UI_URL="http://localhost:3000"
API_URL="http://localhost:8000"

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║                                                          ║"
    echo "║        🔭 ESC - Experimental Scope Control 🔭           ║"
    echo "║            Docker Deployment Launcher                    ║"
    echo "║                                                          ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Check prerequisites
check_requirements() {
    print_info "Checking system requirements..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "Please install Docker from https://docker.com"
        exit 1
    fi
    print_status "Docker found: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_status "Docker Compose found"
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "Please start Docker and try again"
        exit 1
    fi
    print_status "Docker daemon is running"
}

# Create necessary directories
setup_directories() {
    print_info "Setting up directories..."
    mkdir -p "$LOG_DIR"
    mkdir -p "./monitor/logs"
    mkdir -p "./server/logs"
    mkdir -p "./ui/logs"
    print_status "Log directories created"
}

# Start services
start_services() {
    print_info "Starting ESC services..."
    
    # Start main services
    echo -n "Starting backend and frontend services... "
    if docker-compose -f "$COMPOSE_FILE" up -d > "$LOG_DIR/docker-compose.log" 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        print_error "Failed to start main services. Check $LOG_DIR/docker-compose.log"
        exit 1
    fi
    
    # Start monitor if requested
    if [[ "$1" == "--with-monitor" ]] || [[ "$1" == "-m" ]]; then
        echo -n "Starting monitoring dashboard... "
        if docker-compose -f "$MONITOR_COMPOSE_FILE" up -d monitor > "$LOG_DIR/monitor.log" 2>&1; then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${YELLOW}WARNING${NC}"
            print_warning "Monitor failed to start, but main services are running"
        fi
    fi
}

# Wait for services to be healthy
wait_for_services() {
    print_info "Waiting for services to be ready..."
    
    # Wait for backend
    echo -n "Waiting for backend API... "
    for i in {1..30}; do
        if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
            echo -e "${GREEN}OK${NC}"
            break
        fi
        sleep 2
        if [ $i -eq 30 ]; then
            echo -e "${YELLOW}TIMEOUT${NC}"
            print_warning "Backend is taking longer than expected"
        fi
    done
    
    # Wait for frontend
    echo -n "Waiting for frontend UI... "
    for i in {1..30}; do
        if curl -s -f "$UI_URL" > /dev/null 2>&1; then
            echo -e "${GREEN}OK${NC}"
            break
        fi
        sleep 2
        if [ $i -eq 30 ]; then
            echo -e "${YELLOW}TIMEOUT${NC}"
            print_warning "Frontend is taking longer than expected"
        fi
    done
}

# Show service status
show_status() {
    print_info "Service Status:"
    echo ""
    docker-compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    
    if [[ -f "$MONITOR_COMPOSE_FILE" ]]; then
        docker-compose -f "$MONITOR_COMPOSE_FILE" ps monitor --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
    fi
}

# Show logs menu
show_logs_menu() {
    echo ""
    echo "View Logs:"
    echo "  1) All services"
    echo "  2) Backend (server)"
    echo "  3) Frontend (ui)"
    echo "  4) Monitor dashboard"
    echo "  5) Return to main menu"
    echo ""
    read -p "Select option: " choice
    
    case $choice in
        1)
            docker-compose -f "$COMPOSE_FILE" logs --tail=100 -f
            ;;
        2)
            docker-compose -f "$COMPOSE_FILE" logs --tail=100 -f server
            ;;
        3)
            docker-compose -f "$COMPOSE_FILE" logs --tail=100 -f ui
            ;;
        4)
            if [[ -f "$MONITOR_COMPOSE_FILE" ]]; then
                docker-compose -f "$MONITOR_COMPOSE_FILE" logs --tail=100 -f monitor
            else
                print_error "Monitor is not configured"
            fi
            ;;
        5)
            return
            ;;
        *)
            print_error "Invalid option"
            ;;
    esac
}

# Main menu
show_main_menu() {
    while true; do
        echo ""
        echo "╔══════════════════════════════════════════════════════════╗"
        echo "║                     Main Menu                           ║"
        echo "╚══════════════════════════════════════════════════════════╝"
        echo ""
        echo "  1) Start all services"
        echo "  2) Start with monitoring dashboard"
        echo "  3) Stop all services"
        echo "  4) Restart services"
        echo "  5) View service status"
        echo "  6) View logs"
        echo "  7) Open UI in browser"
        echo "  8) Open monitor dashboard"
        echo "  9) Clean up (remove containers and volumes)"
        echo "  0) Exit"
        echo ""
        read -p "Select option: " choice
        
        case $choice in
            1)
                start_services
                wait_for_services
                show_status
                ;;
            2)
                start_services --with-monitor
                wait_for_services
                show_status
                print_info "Monitor dashboard: $MONITOR_URL"
                ;;
            3)
                print_info "Stopping all services..."
                docker-compose -f "$COMPOSE_FILE" down
                [[ -f "$MONITOR_COMPOSE_FILE" ]] && docker-compose -f "$MONITOR_COMPOSE_FILE" down
                print_status "Services stopped"
                ;;
            4)
                print_info "Restarting services..."
                docker-compose -f "$COMPOSE_FILE" restart
                wait_for_services
                show_status
                ;;
            5)
                show_status
                ;;
            6)
                show_logs_menu
                ;;
            7)
                print_info "Opening UI in browser..."
                if command -v xdg-open &> /dev/null; then
                    xdg-open "$UI_URL"
                elif command -v open &> /dev/null; then
                    open "$UI_URL"
                else
                    print_info "Please open $UI_URL in your browser"
                fi
                ;;
            8)
                print_info "Opening monitor dashboard..."
                if command -v xdg-open &> /dev/null; then
                    xdg-open "$MONITOR_URL"
                elif command -v open &> /dev/null; then
                    open "$MONITOR_URL"
                else
                    print_info "Please open $MONITOR_URL in your browser"
                fi
                ;;
            9)
                read -p "This will remove all containers and data. Are you sure? (y/N): " confirm
                if [[ "$confirm" == "y" ]] || [[ "$confirm" == "Y" ]]; then
                    print_warning "Cleaning up..."
                    docker-compose -f "$COMPOSE_FILE" down -v
                    [[ -f "$MONITOR_COMPOSE_FILE" ]] && docker-compose -f "$MONITOR_COMPOSE_FILE" down -v
                    print_status "Cleanup complete"
                fi
                ;;
            0)
                print_info "Exiting..."
                exit 0
                ;;
            *)
                print_error "Invalid option"
                ;;
        esac
    done
}

# Trap signals for cleanup
trap 'echo ""; print_warning "Interrupted. Exiting..."; exit 1' INT TERM

# Main execution
main() {
    clear
    print_header
    check_requirements
    setup_directories
    
    # Check if services are already running
    if docker-compose -f "$COMPOSE_FILE" ps -q | grep -q .; then
        print_warning "ESC services are already running"
        show_status
    else
        # Auto-start services if not running
        read -p "Start ESC services now? (Y/n): " start_now
        if [[ "$start_now" != "n" ]] && [[ "$start_now" != "N" ]]; then
            read -p "Include monitoring dashboard? (y/N): " with_monitor
            if [[ "$with_monitor" == "y" ]] || [[ "$with_monitor" == "Y" ]]; then
                start_services --with-monitor
            else
                start_services
            fi
            wait_for_services
            show_status
            
            echo ""
            print_status "ESC is ready!"
            echo ""
            echo "  📡 UI:       $UI_URL"
            echo "  🔧 API:      $API_URL/docs"
            [[ "$with_monitor" == "y" ]] && echo "  📊 Monitor:  $MONITOR_URL"
            echo ""
        fi
    fi
    
    show_main_menu
}

# Run main function
main "$@"