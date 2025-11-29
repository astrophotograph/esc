# Building ESC for Distribution

This guide explains how to build and distribute the ESC application for different platforms.

## Prerequisites

### All Platforms
- Node.js 20+ and pnpm
- Python 3.12+
- uv (Python package manager)
- Git

### Platform-Specific

**macOS:**
- Xcode Command Line Tools
- macOS 10.13+ for building
- Apple Developer certificate (for signing, optional)

**Windows:**
- Windows 10/11
- Visual Studio Build Tools or Visual Studio 2019+
- Windows SDK

**Linux:**
- build-essential package
- Various libraries: `libgtk-3-0`, `libnotify4`, `libnss3`, `libxss1`, `libxtst6`

## Quick Build

### Local Development Build

```bash
# Build for current platform
./scripts/build-app.sh current
```

### Platform-Specific Builds

```bash
# macOS
./scripts/build-app.sh mac

# Windows
./scripts/build-app.sh win

# Linux
./scripts/build-app.sh linux

# All platforms (only works on macOS with Wine installed)
./scripts/build-app.sh all
```

## Manual Build Process

### 1. Build Frontend

```bash
cd ui
pnpm install --frozen-lockfile
pnpm run build
```

### 2. Bundle Python Backend

```bash
./scripts/bundle-python.sh
```

### 3. Build Electron App

```bash
cd electron
pnpm install --frozen-lockfile
pnpm run build:mac    # For macOS
pnpm run build:win    # For Windows
pnpm run build:linux  # For Linux
```

## Distribution

### macOS

The build produces:
- **Universal App (x64 + arm64)**: `electron/dist/mac/ESC.app`
- Can be distributed as:
  - ZIP file (right-click → Compress)
  - DMG (using `create-dmg` or similar tools)

#### Code Signing (Optional)

For distribution outside the Mac App Store:

```bash
# Sign the app
codesign --deep --force --verbose --sign "Developer ID Application: Your Name" electron/dist/mac/ESC.app

# Notarize (requires Apple Developer account)
xcrun altool --notarize-app --file electron/dist/mac/ESC.zip --type osx --primary-bundle-id com.esc.app
```

### Windows

The build produces:
- **NSIS Installer**: `electron/dist/ESC Setup *.exe`
- Includes auto-update support

#### Code Signing (Optional)

```powershell
# Sign with certificate
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com electron/dist/*.exe
```

### Linux

The build produces:
- **AppImage**: `electron/dist/ESC-*.AppImage`
- Universal, runs on most Linux distributions

## GitHub Actions Automation

### Automatic Builds

The repository includes GitHub Actions workflow that automatically builds for all platforms.

#### Trigger a Build

1. **Via Git Tag:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Via GitHub UI:**
   - Go to Actions tab
   - Select "Build and Release" workflow
   - Click "Run workflow"

### Release Process

1. **Create a version tag:**
   ```bash
   # Update version in package.json files first
   git add .
   git commit -m "Release v1.0.0"
   git tag v1.0.0
   git push origin main --tags
   ```

2. **GitHub Actions will:**
   - Build for all platforms
   - Create a draft release
   - Upload artifacts

3. **Finalize release:**
   - Go to GitHub Releases
   - Edit the draft release
   - Add release notes
   - Publish

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