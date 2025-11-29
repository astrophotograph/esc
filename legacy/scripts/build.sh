#!/bin/bash

# Universal build script for ALP Experimental desktop application
# Automatically detects platform and calls the appropriate build script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Function to detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*)
            echo "macos"
            ;;
        Linux*)
            echo "linux"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Function to show help
show_help() {
    echo "ALP Experimental Universal Build Script"
    echo ""
    echo "This script automatically detects your platform and runs the appropriate build script."
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --help, -h           Show this help message"
    echo "  --platform PLATFORM  Force specific platform (macos, linux, windows)"
    echo "  --list-platforms     List available platforms"
    echo "  --clean-only         Only clean build directories"
    echo "  --backend-only       Only build Python backend"
    echo "  --frontend-only      Only build Next.js frontend"
    echo "  --electron-only      Only package Electron app"
    echo "  --skip-tests         Skip running tests"
    echo "  --verbose            Enable verbose output"
    echo "  --debug              Build debug version"
    echo ""
    echo "Environment variables:"
    echo "  BUILD_TYPE           Build type (release, debug) [default: release]"
    echo "  SKIP_TESTS           Skip tests (true, false) [default: false]"
    echo "  VERBOSE              Verbose output (true, false) [default: false]"
    echo ""
    echo "Platform-specific scripts:"
    echo "  macOS:     ./build-macos.sh"
    echo "  Linux:     ./build-linux.sh"
    echo "  Windows:   ./build-windows.ps1"
    echo ""
}

# Function to list platforms
list_platforms() {
    echo "Available platforms:"
    echo "  macos    - macOS (Intel and Apple Silicon)"
    echo "  linux    - Linux (x86_64, AppImage and deb packages)"
    echo "  windows  - Windows (x86_64, exe and msi installers)"
    echo ""
    echo "Current platform: $(detect_platform)"
}

# Main execution
main() {
    local platform=""
    local forced_platform=""
    local script_args=()
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --platform)
                forced_platform="$2"
                shift 2
                ;;
            --list-platforms)
                list_platforms
                exit 0
                ;;
            *)
                # Pass through all other arguments to the platform-specific script
                script_args+=("$1")
                shift
                ;;
        esac
    done
    
    # Determine platform
    if [[ -n "$forced_platform" ]]; then
        platform="$forced_platform"
        print_info "Using forced platform: $platform"
    else
        platform=$(detect_platform)
        print_info "Detected platform: $platform"
    fi
    
    # Validate platform
    case "$platform" in
        macos|linux|windows)
            # Valid platform
            ;;
        unknown)
            print_error "Unknown platform. Use --platform to specify (macos, linux, windows)"
            ;;
        *)
            print_error "Invalid platform: $platform. Valid options: macos, linux, windows"
            ;;
    esac
    
    # Show build information
    echo -e "${BLUE}🚀 ALP Experimental Universal Build Script${NC}"
    echo -e "${BLUE}===========================================${NC}"
    echo ""
    echo "Platform: $platform"
    echo "Arguments: ${script_args[*]}"
    echo ""
    
    # Execute platform-specific build script
    case "$platform" in
        macos)
            build_script="$SCRIPT_DIR/build-macos.sh"
            if [[ -f "$build_script" ]]; then
                print_info "Running macOS build script..."
                exec "$build_script" "${script_args[@]}"
            else
                print_error "macOS build script not found: $build_script"
            fi
            ;;
        linux)
            build_script="$SCRIPT_DIR/build-linux.sh"
            if [[ -f "$build_script" ]]; then
                print_info "Running Linux build script..."
                exec "$build_script" "${script_args[@]}"
            else
                print_error "Linux build script not found: $build_script"
            fi
            ;;
        windows)
            build_script="$SCRIPT_DIR/build-windows.ps1"
            if [[ -f "$build_script" ]]; then
                print_info "Running Windows build script..."
                if command -v pwsh >/dev/null 2>&1; then
                    exec pwsh -File "$build_script" "${script_args[@]}"
                elif command -v powershell >/dev/null 2>&1; then
                    exec powershell -File "$build_script" "${script_args[@]}"
                else
                    print_error "PowerShell not found. Please install PowerShell or PowerShell Core."
                fi
            else
                print_error "Windows build script not found: $build_script"
            fi
            ;;
    esac
}

# Run main function
main "$@"