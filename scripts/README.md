# Build Scripts for ALP Experimental Desktop Application

This directory contains build scripts to package ALP Experimental as native desktop applications for Windows, macOS, and Linux.

## Quick Start (macOS Local Development)

For local testing and development on macOS:

```bash
# Run the local build script (faster, no code signing)
./scripts/build-local-macos.sh
```

This creates a local development build that you can test immediately.

## Platform-Specific Builds

### Universal Build Script
```bash
# Automatically detects your platform and runs the appropriate script
./scripts/build.sh

# Force a specific platform
./scripts/build.sh --platform macos
./scripts/build.sh --platform linux  
./scripts/build.sh --platform windows
```

### Direct Platform Scripts

#### macOS
```bash
./scripts/build-macos.sh                 # Full production build
./scripts/build-local-macos.sh           # Local development build (recommended for testing)
```

#### Linux
```bash
./scripts/build-linux.sh                 # Creates AppImage and deb packages
```

#### Windows
```powershell
.\scripts\build-windows.ps1              # Creates exe and msi installers
```

## Build Script Options

All scripts support these common options:

```bash
--help              # Show detailed help
--clean-only        # Only clean build directories
--backend-only      # Only build Python backend
--frontend-only     # Only build Next.js frontend
--electron-only     # Only package Electron app
--skip-tests        # Skip running tests
--verbose           # Enable verbose output
--debug             # Build debug version
```

## Prerequisites

### macOS
- **Python 3.12+**: `brew install python@3.12`
- **Node.js 18+**: `brew install node@18`
- **uv**: `pip install uv`
- **Xcode Command Line Tools**: `xcode-select --install`

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install -y python3.12 python3.12-dev nodejs npm build-essential fuse
pip install uv
```

### Windows
- **Python 3.12+**: Download from python.org
- **Node.js 18+**: Download from nodejs.org  
- **uv**: `pip install uv`
- **Visual Studio Build Tools** (for PyInstaller)

## Build Output

### Intermediate Files
- `build/` - Intermediate build artifacts
  - `alp-experimental-server/` - Packaged Python backend
  - `ui/` - Built Next.js frontend

### Final Distributables
- `dist/` - Final installer packages
  - **macOS**: `.dmg` installer, `.app` bundle
  - **Windows**: `.exe` installer, `.msi` package
  - **Linux**: `.AppImage`, `.deb` package

## Local Development Workflow

1. **Quick Test Build** (macOS):
   ```bash
   ./scripts/build-local-macos.sh
   ```

2. **Test the Application**:
   ```bash
   # The script will show you how to run the built app
   # Usually something like:
   cd electron/dist/mac
   open "ALP Experimental (Local).app"
   ```

3. **Production Build** (when ready):
   ```bash
   ./scripts/build-macos.sh
   ```

## Architecture Overview

The build process creates a complete desktop application by:

1. **Backend Packaging**: Uses PyInstaller to bundle the Python/FastAPI server with all dependencies (~200MB)
2. **Frontend Building**: Uses Next.js standalone build to create optimized static assets (~20MB)  
3. **Electron Wrapping**: Packages everything in an Electron shell for native desktop experience

## Build Performance

### Local Development Build (`build-local-macos.sh`)
- **Time**: ~5-10 minutes
- **Size**: ~250MB
- **Features**: Basic functionality, console debugging, no code signing
- **Use**: Local testing and development

### Production Build (`build-macos.sh`)
- **Time**: ~15-30 minutes  
- **Size**: ~220MB compressed
- **Features**: Full optimization, code signing, universal binary
- **Use**: Distribution to users

## Troubleshooting

### Common Issues

#### PyInstaller Build Fails
```bash
# Install missing system dependencies
brew install python@3.12
pip install --upgrade pyinstaller

# Clean and retry
./scripts/build-macos.sh --clean-only
./scripts/build-macos.sh --backend-only
```

#### Node.js Build Issues
```bash
# Clear npm cache
cd ui && npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Retry frontend build
./scripts/build-macos.sh --frontend-only
```

#### Electron Packaging Issues
```bash
# Clean Electron cache
cd electron
rm -rf node_modules dist
npm install

# Retry Electron packaging
./scripts/build-macos.sh --electron-only
```

### Environment Variables

Set these before running builds:

```bash
export BUILD_TYPE=release        # or debug
export SKIP_TESTS=true          # to speed up builds
export VERBOSE=true             # for detailed output
```

### Build Size Optimization

The scripts include several optimizations:
- **PyInstaller exclusions**: Removes development tools (~50MB savings)
- **UPX compression**: Compresses binaries (Windows/Linux only)
- **Tree shaking**: Next.js removes unused JavaScript
- **Asset optimization**: Compresses images and static files

### Code Signing (Production)

For distribution, you'll need:
- **macOS**: Apple Developer certificate ($99/year)
- **Windows**: EV Code Signing certificate (~$300/year)
- **Linux**: No signing required

See `BUILD_PIPELINE_ARCHITECTURE.md` for detailed code signing setup.

## CI/CD Integration

These scripts are designed to work with:
- **GitHub Actions**: See `.github/workflows/` (coming soon)
- **Local CI**: Can be run in Docker containers
- **Jenkins/GitLab**: Compatible with standard CI/CD pipelines

## Next Steps

1. **Try the local build**: `./scripts/build-local-macos.sh`
2. **Test the application**: Follow the script's output instructions
3. **Report issues**: If builds fail, check the troubleshooting section
4. **Production ready**: Use `./scripts/build-macos.sh` for distribution

## Support

- **Build Issues**: Check the troubleshooting section above
- **Feature Requests**: Update the scripts as needed for your workflow
- **Platform Support**: Scripts support macOS (Intel & Apple Silicon), Windows 10/11, Linux (Ubuntu 20.04+)

The build scripts are designed to be self-contained and should work out of the box on a properly configured development machine.