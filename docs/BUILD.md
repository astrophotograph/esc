# ESC Build Documentation

This document describes the various build options for the ESC Electron application.

## Build Options Overview

The ESC application consists of three main components:
1. **UI** - Next.js frontend (builds quickly)
2. **Server** - Python backend (multiple build options)
3. **Electron** - Desktop wrapper

## Server Build Options

### 1. PyInstaller (Default)
**Pros:** Faster build time (~5-10 minutes)  
**Cons:** Larger file size, dependency issues with complex packages

```bash
# Build with PyInstaller
npm run build:server

# Or directly
cd server && uv run pyinstaller --onefile --name main main.py
```

### 2. Nuitka (Alternative)
**Pros:** Better dependency handling, smaller size, faster runtime  
**Cons:** Very slow build time (20-60 minutes)

```bash
# Build with Nuitka (folder distribution - recommended)
npm run build:server:nuitka

# Build with Nuitka (single file - very slow)
npm run build:server:nuitka:onefile

# Build with Nuitka (fast mode for testing)
npm run build:server:nuitka:fast

# Or using make directly
cd server
make build-nuitka-folder  # Recommended
make build-nuitka         # Single file (slow)
make build-nuitka-fast    # Fast build for testing
```

### 3. Python Bundle (Development)
**Pros:** No compilation needed, easy debugging  
**Cons:** Requires Python 3 installed, slow first startup

```bash
# Create Python bundle
./scripts/bundle-python.sh
```

## Complete Electron Build

### Standard Build (PyInstaller)
```bash
# Build everything with PyInstaller backend
npm run electron:build

# Or step by step:
npm run build:ui
npm run build:server
cd electron && pnpm run build
```

### Nuitka Build
```bash
# Build everything with Nuitka backend
npm run electron:build:nuitka

# Or step by step:
npm run build:ui
npm run build:server:nuitka
cd electron && pnpm run build:nuitka
```

## Build Time Estimates

| Component | PyInstaller | Nuitka (folder) | Nuitka (onefile) |
|-----------|------------|-----------------|------------------|
| UI        | 1-2 min    | 1-2 min         | 1-2 min          |
| Server    | 5-10 min   | 20-30 min       | 30-60 min        |
| Electron  | 1-2 min    | 1-2 min         | 1-2 min          |
| **Total** | ~10-15 min | ~25-35 min      | ~35-65 min       |

## Troubleshooting

### PyInstaller Issues
- Missing modules: Add to `--hidden-import` or `--collect-all`
- Large file size: Normal for PyInstaller with scientific Python stack

### Nuitka Issues
- Slow build: Use `--fast` mode for testing
- Missing modules: Add to `--include-module` or `--include-package`
- Out of memory: Nuitka uses significant RAM, close other applications

### General Issues
- Code signing warnings on macOS: Expected without Apple Developer certificate
- First startup slow with Python bundle: Dependencies being installed
- Backend not starting: Check logs at `~/Library/Logs/esc-electron/main.log`

## Recommended Approach

1. **Development**: Use Python bundle or run servers separately
2. **Testing**: Use Nuitka fast build or PyInstaller
3. **Production**: Use Nuitka folder distribution for best compatibility

## Backend Selection Priority

The Electron app checks for backends in this order:
1. Nuitka build (`server-nuitka/`)
2. Python bundle (`python-server/`)
3. PyInstaller build (`server/main`)

## Clean Build

To clean all build artifacts:
```bash
cd server && make clean
cd ../ui && rm -rf .next
cd ../electron && rm -rf dist
```