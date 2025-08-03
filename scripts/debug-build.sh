#!/bin/bash

# Debug build script to diagnose build issues

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build"
ELECTRON_DIR="$PROJECT_ROOT/electron"
SERVER_DIR="$PROJECT_ROOT/server"
UI_DIR="$PROJECT_ROOT/ui"

echo -e "${BLUE}🔍 Debug Build for ALP Experimental${NC}"
echo ""

print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check current state
print_section "Checking Current Build State"

echo "Build directory contents:"
if [[ -d "$BUILD_DIR" ]]; then
    ls -la "$BUILD_DIR"
    echo ""
    echo "Backend executable:"
    if [[ -f "$BUILD_DIR/alp-experimental-server/alp-experimental-server" ]]; then
        ls -la "$BUILD_DIR/alp-experimental-server/alp-experimental-server"
        print_success "Backend executable exists"
    else
        print_error "Backend executable missing"
    fi
    
    echo ""
    echo "Frontend build:"
    if [[ -d "$BUILD_DIR/ui" ]]; then
        ls -la "$BUILD_DIR/ui" | head -5
        print_success "Frontend build exists"
    else
        print_error "Frontend build missing - this is likely the problem!"
    fi
else
    print_error "Build directory doesn't exist"
fi

echo ""
echo "Electron dist directory:"
if [[ -d "$ELECTRON_DIR/dist" ]]; then
    ls -la "$ELECTRON_DIR/dist"
else
    print_error "Electron dist directory missing"
fi

# Build missing frontend
if [[ ! -d "$BUILD_DIR/ui" ]]; then
    print_section "Building Missing Frontend"
    
    cd "$UI_DIR"
    
    echo "Installing frontend dependencies..."
    npm ci --silent
    
    echo "Building frontend..."
    export NODE_ENV=production
    export NEXT_TELEMETRY_DISABLED=1
    npm run build
    
    # Copy to build directory
    mkdir -p "$BUILD_DIR/ui"
    
    if [[ -d ".next/standalone" ]]; then
        echo "Copying standalone build..."
        cp -r ".next/standalone"/* "$BUILD_DIR/ui/"
        mkdir -p "$BUILD_DIR/ui/.next"
        cp -r ".next/static" "$BUILD_DIR/ui/.next/" 2>/dev/null || true
        cp -r "public" "$BUILD_DIR/ui/" 2>/dev/null || true
        print_success "Frontend copied to build directory"
    else
        print_error "Frontend standalone build failed"
    fi
    
    cd "$PROJECT_ROOT"
fi

# Create debug Electron app
print_section "Creating Debug Electron App"

cd "$ELECTRON_DIR"

# Create debug electron-builder config
cat > electron-builder-debug.json << EOF
{
  "appId": "com.alp.experimental.debug",
  "productName": "ALP Experimental Debug",
  "directories": {
    "output": "dist"
  },
  "files": [
    "main.js",
    "preload.js", 
    "processManager.js",
    "node_modules/**/*"
  ],
  "extraResources": [
    {
      "from": "../build/alp-experimental-server",
      "to": "server",
      "filter": ["**/*"]
    },
    {
      "from": "../build/ui",
      "to": "ui",
      "filter": ["**/*"]
    }
  ],
  "mac": {
    "category": "public.app-category.utilities",
    "target": [
      {
        "target": "dir"
      }
    ],
    "icon": "assets/icon.icns"
  },
  "compression": "store"
}
EOF

# First, let's create a debug version of main.js that logs everything
cp main.js main-debug.js

# Add debug logging to main.js
cat > main-debug.js << 'EOF'
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { ProcessManager } = require('./processManager');
const log = require('electron-log');

// Configure logging to file and console
log.transports.file.level = 'debug';
log.transports.console.level = 'debug';
log.info('=== ALP Experimental Debug Mode ===');
log.info('App starting...');

// Log all app events
app.on('ready', () => log.info('App ready event'));
app.on('window-all-closed', () => log.info('All windows closed event'));
app.on('before-quit', () => log.info('Before quit event'));
app.on('will-quit', () => log.info('Will quit event'));
app.on('quit', () => log.info('Quit event'));

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Second instance detected, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let processManager;

// Enable live reload for Electron in development
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
  } catch (err) {
    log.warn('electron-reload not available:', err.message);
  }
}

function createWindow() {
  log.info('Creating main window...');
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false // Don't show until ready
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    log.info('Window ready to show');
    mainWindow.show();
  });

  // Load the app - always connect to localhost:3000
  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  log.info('Loading URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // Handle window closed
  mainWindow.on('closed', () => {
    log.info('Main window closed');
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            shell.openExternal('https://github.com/astrophotograph/alp-experimental');
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: 'About ' + app.getName(), role: 'about' },
        { type: 'separator' },
        { label: 'Services', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: 'Hide ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'Command+Shift+H', role: 'hideothers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Command+Q', click: () => app.quit() }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(async () => {
  log.info('App is ready, starting services...');

  // Initialize process manager
  processManager = new ProcessManager();

  try {
    // Start backend server
    log.info('Starting backend server...');
    await processManager.startBackend();
    log.info('Backend server started successfully');

    // Start frontend (in development, assume it's already running)
    if (process.env.NODE_ENV !== 'development') {
      log.info('Starting frontend server...');
      await processManager.startFrontend();
      log.info('Frontend server started successfully');
    } else {
      log.info('Development mode - skipping frontend server start');
    }

    // Wait a bit for servers to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create window
    createWindow();
  } catch (error) {
    log.error('Failed to start services:', error);
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  log.info('App is quitting...');
  
  if (processManager && !processManager.isShuttingDown) {
    event.preventDefault();
    
    try {
      await processManager.stopAll();
      app.quit();
    } catch (error) {
      log.error('Error during shutdown:', error);
      app.quit();
    }
  }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.startsWith('https://localhost')) {
    // Ignore certificate errors for localhost (development)
    event.preventDefault();
    callback(true);
  } else {
    // Use default behavior for other URLs
    callback(false);
  }
});
EOF

# Update the config to use debug main.js
sed -i '' 's/"main.js"/"main-debug.js"/' electron-builder-debug.json

echo "Building debug Electron app..."
npx electron-builder --config electron-builder-debug.json --mac --dir

if [[ -d "dist/mac/ALP Experimental Debug.app" ]]; then
    print_success "Debug app created successfully!"
    
    # Show the log file location
    echo ""
    echo "Debug app: $ELECTRON_DIR/dist/mac/ALP Experimental Debug.app"
    echo "Log file: ~/Library/Logs/ALP Experimental Debug/main.log"
    echo ""
    echo "To run and see logs:"
    echo "1. Open: open '$ELECTRON_DIR/dist/mac/ALP Experimental Debug.app'"
    echo "2. Check logs: tail -f ~/Library/Logs/ALP\\ Experimental\\ Debug/main.log"
    echo ""
    echo "Or run from terminal to see output:"
    echo "'$ELECTRON_DIR/dist/mac/ALP Experimental Debug.app/Contents/MacOS/ALP Experimental Debug'"
else
    print_error "Debug app build failed"
fi

cd "$PROJECT_ROOT"