# Electron Desktop App Packaging Plan for ALP Experimental

## Overview
This document outlines the plan for packaging ALP Experimental as a standalone desktop application using Electron, making it accessible to non-technical users through a familiar install-and-run experience.

## Architecture

### High-Level Design
```
┌─────────────────────────────────────┐
│         Electron Main Process       │
│  ┌─────────────────────────────┐   │
│  │    Python Server Manager     │   │ ← Spawns & manages
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │    Next.js Server Manager   │   │ ← Spawns & manages
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────┐
│      Electron Renderer Process      │
│  ┌─────────────────────────────┐   │
│  │    Chromium Web View        │   │ ← Loads http://localhost:3000
│  │    (Next.js Frontend)       │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Key Components
1. **Electron Shell**: Native window wrapper
2. **Python Backend**: Bundled as portable executable using PyInstaller
3. **Next.js Frontend**: Bundled as static build or running server
4. **Process Manager**: Handles lifecycle of backend services

## Implementation Phases

### Phase 1: Basic Electron Wrapper (Week 1)

#### 1.1 Create Electron Application Structure
```
electron-app/
├── package.json
├── main.js              # Main process
├── preload.js           # Preload script
├── build/               # Build configuration
│   ├── icon.ico         # Windows icon
│   ├── icon.icns        # macOS icon
│   └── icon.png         # Linux icon
├── src/
│   ├── main/
│   │   ├── server-manager.js
│   │   ├── python-manager.js
│   │   └── window-manager.js
│   └── renderer/
│       └── index.html   # Loading screen
└── resources/
    ├── python/          # Python server files
    └── nextjs/          # Next.js build output
```

#### 1.2 Main Process Tasks
- [ ] Create Electron main window
- [ ] Implement loading/splash screen
- [ ] Handle window state persistence
- [ ] Implement menu bar with standard items
- [ ] Add system tray support (optional)

#### 1.3 Server Management
- [ ] Spawn Python backend as child process
- [ ] Spawn Next.js server (or serve static build)
- [ ] Health check endpoints
- [ ] Graceful shutdown handling
- [ ] Port conflict resolution

### Phase 2: Python Backend Packaging (Week 2)

#### 2.1 PyInstaller Configuration
```python
# pyinstaller.spec
a = Analysis(
    ['server/main.py'],
    pathex=['server'],
    binaries=[],
    datas=[
        ('server/templates', 'templates'),
        ('server/static', 'static'),
    ],
    hiddenimports=['uvicorn', 'fastapi', 'pydantic'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
)
```

#### 2.2 Backend Packaging Tasks
- [ ] Create PyInstaller spec file
- [ ] Handle all Python dependencies
- [ ] Test executable on target platforms
- [ ] Optimize bundle size
- [ ] Include required system libraries

### Phase 3: Frontend Integration (Week 3)

#### 3.1 Next.js Build Options

**Option A: Static Export** (Simpler)
```javascript
// next.config.js
module.exports = {
  output: 'export',
  // ... other config
}
```

**Option B: Standalone Server** (Better for SSR)
```javascript
// next.config.js
module.exports = {
  output: 'standalone',
  // ... other config
}
```

#### 3.2 Frontend Tasks
- [ ] Configure Next.js for embedded use
- [ ] Update API endpoints for local server
- [ ] Handle offline scenarios
- [ ] Implement auto-reload on server restart
- [ ] Add connection status indicators

### Phase 4: Auto-Update System (Week 4)

#### 4.1 Update Infrastructure
- [ ] Set up electron-updater
- [ ] Configure update server (GitHub Releases)
- [ ] Implement update UI/notifications
- [ ] Handle differential updates
- [ ] Test update flow

#### 4.2 Version Management
```javascript
// auto-updater.js
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();
autoUpdater.on('update-available', () => {
  // Show update notification
});
```

### Phase 5: Installer Creation (Week 5)

#### 5.1 Electron Builder Configuration
```json
{
  "build": {
    "appId": "com.astrophotograph.alp-experimental",
    "productName": "ALP Experimental",
    "directories": {
      "output": "dist"
    },
    "files": [
      "dist/**/*",
      "resources/**/*"
    ],
    "mac": {
      "category": "public.app-category.photography",
      "target": ["dmg", "zip"]
    },
    "win": {
      "target": ["nsis", "portable"]
    },
    "linux": {
      "target": ["AppImage", "deb", "rpm"]
    }
  }
}
```

#### 5.2 Platform-Specific Tasks
- [ ] Windows: NSIS installer with shortcuts
- [ ] macOS: Code signing and notarization
- [ ] Linux: AppImage for universal compatibility
- [ ] Create portable versions
- [ ] Test installers on clean systems

### Phase 6: Polish & Testing (Week 6)

#### 6.1 User Experience
- [ ] First-run setup wizard
- [ ] Telescope auto-discovery UI
- [ ] Connection troubleshooting guide
- [ ] Integrated help documentation
- [ ] Crash reporting (with consent)

#### 6.2 Testing Matrix
- [ ] Windows 10/11 (x64)
- [ ] macOS 12+ (Intel & Apple Silicon)
- [ ] Ubuntu 20.04+ 
- [ ] Raspberry Pi OS (64-bit)

## Technical Considerations

### 1. Security
- Code sign all executables
- Implement CSP headers
- Disable Node.js integration in renderer
- Use context isolation
- Validate all IPC messages

### 2. Performance
- Lazy load Python server
- Optimize startup time
- Implement proper caching
- Monitor memory usage
- Profile CPU usage

### 3. Error Handling
- Comprehensive logging system
- User-friendly error messages
- Automatic error reporting (opt-in)
- Recovery mechanisms
- Debug mode for advanced users

### 4. Distribution Channels

#### Primary: GitHub Releases
- Automatic builds via GitHub Actions
- Download counter for metrics
- Release notes automation

#### Secondary: Package Managers
- **Windows**: Chocolatey, Winget
- **macOS**: Homebrew Cask
- **Linux**: Snap, Flatpak

## File Size Optimization

### Current Estimates
- Electron Shell: ~50MB
- Python Runtime: ~40MB
- Python Dependencies: ~100MB
- Next.js Build: ~20MB
- **Total**: ~210MB compressed

### Optimization Strategies
1. Use electron-builder compression
2. Exclude unnecessary Python packages
3. Tree-shake JavaScript dependencies
4. Use production builds only
5. Consider separate downloads for updates

## Development Workflow

### 1. Local Development
```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for current platform
npm run electron:build
```

### 2. CI/CD Pipeline
```yaml
# .github/workflows/electron-build.yml
name: Build Electron App
on:
  push:
    tags:
      - 'v*'
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Build Electron App
        run: |
          npm install
          npm run electron:build
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
```

## User Documentation

### 1. Installation Guide
- Download appropriate installer
- Run installer (may require admin rights)
- Launch from desktop/start menu
- Follow first-run setup

### 2. Troubleshooting Guide
- Port conflicts resolution
- Firewall configuration
- Telescope connection issues
- Update problems
- Clean reinstall steps

## Success Metrics
- Install success rate > 95%
- Startup time < 5 seconds
- Update success rate > 90%
- Crash rate < 0.1%
- User satisfaction > 4.5/5

## Timeline Summary
- **Week 1**: Basic Electron wrapper
- **Week 2**: Python backend packaging
- **Week 3**: Frontend integration
- **Week 4**: Auto-update system
- **Week 5**: Installer creation
- **Week 6**: Polish and testing
- **Total**: 6 weeks to production-ready

## Next Steps
1. Set up electron-app directory structure
2. Create proof-of-concept with basic window
3. Test Python packaging separately
4. Implement server management
5. Begin incremental integration

This plan provides a clear path from the current web-based architecture to a user-friendly desktop application that non-technical users can easily install and use.