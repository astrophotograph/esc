const { app, BrowserWindow, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const { ProcessManager } = require('./processManager');
const log = require('electron-log');

// Configure logging
log.transports.file.level = 'info';
log.info('App starting...');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let processManager;

// Enable live reload for Electron in development
if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
  
  // Force app to show in dock in development
  if (process.platform === 'darwin') {
    app.dock.show();
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'icons', 'icon.png'),
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
    mainWindow.show();
  });

  // Load the app - always connect to localhost:3000
  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  log.info(`Loading URL: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Add debugging for page load
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log.error(`Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Page finished loading');
  });
  
  // Open DevTools in development or when debugging
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

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
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-action', 'new-session');
          }
        },
        {
          label: 'Open Session...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-action', 'open-session');
          }
        },
        { type: 'separator' },
        {
          label: 'Export Data...',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-action', 'export-data');
          }
        },
        { type: 'separator' },
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
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('menu-action', 'preferences');
          }
        }
      ]
    },
    {
      label: 'Telescope',
      submenu: [
        {
          label: 'Connect',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            mainWindow.webContents.send('menu-action', 'connect-telescope');
          }
        },
        {
          label: 'Disconnect',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            mainWindow.webContents.send('menu-action', 'disconnect-telescope');
          }
        },
        { type: 'separator' },
        {
          label: 'Goto Object...',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            mainWindow.webContents.send('menu-action', 'goto-object');
          }
        },
        {
          label: 'Park Telescope',
          click: () => {
            mainWindow.webContents.send('menu-action', 'park-telescope');
          }
        },
        { type: 'separator' },
        {
          label: 'Start Capture',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            mainWindow.webContents.send('menu-action', 'start-capture');
          }
        },
        {
          label: 'Stop Capture',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu-action', 'stop-capture');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        {
          label: 'Toggle Overlay',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            mainWindow.webContents.send('menu-action', 'toggle-overlay');
          }
        },
        {
          label: 'Toggle Annotations',
          accelerator: 'CmdOrCtrl+A',
          click: () => {
            mainWindow.webContents.send('menu-action', 'toggle-annotations');
          }
        },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Close', role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/astrophotograph/alp-experimental/wiki');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/astrophotograph/alp-experimental/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'About ESC',
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

// Set app name for macOS
app.setName('ESC');

// Force dock to show in development
if (process.platform === 'darwin') {
  app.dock.show();
}

// Set dock icon early for macOS
if (process.platform === 'darwin' && app.dock) {
  const iconPath = path.join(__dirname, 'icons', 'icon.png');
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon);
      log.info('Dock icon set early from:', iconPath);
      // Force bounce to make icon visible
      app.dock.bounce('informational');
    }
  } catch (error) {
    log.error('Error setting early dock icon:', error);
  }
}

// App event handlers
app.whenReady().then(async () => {
  log.info('App is ready');
  
  // Set dock icon after app is ready
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, 'icons', 'icon.png');
    log.info('Setting dock icon after ready from:', iconPath);
    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
        log.info('Dock icon set successfully after ready');
      } else {
        log.warn('Icon empty after ready');
      }
    } catch (error) {
      log.error('Error setting dock icon after ready:', error);
    }
  }

  // Initialize process manager
  processManager = new ProcessManager();

  try {
    // Start backend server
    log.info('Starting backend server...');
    await processManager.startBackend();

    // Start frontend
    log.info('Starting frontend server...');
    await processManager.startFrontend();

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