const { app, BrowserWindow, Menu, shell, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
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
let loadingWindow;
let logWindows = {};
let processManager;

// Enable live reload for Electron in development
if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
  } catch (err) {
    log.warn('Electron reload not available:', err.message);
  }
  
  // Force app to show in dock in development
  if (process.platform === 'darwin') {
    app.dock.show();
  }
}

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 400,
    height: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-loading.js')
    },
    icon: path.join(__dirname, 'icons', 'icon.png')
  });

  loadingWindow.loadFile(path.join(__dirname, 'loading.html'));
  loadingWindow.center();
  
  // Prevent loading window from being closed
  loadingWindow.on('closed', () => {
    loadingWindow = null;
  });
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

  // Show window when ready and close loading window
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
      }
      mainWindow.show();
      mainWindow.focus();
    }, 500); // Small delay for smooth transition
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

function createLogWindow(type) {
  try {
    log.info(`Creating log window for ${type}`);
    
    // If window already exists, focus it
    if (logWindows[type] && !logWindows[type].isDestroyed()) {
      logWindows[type].focus();
      return;
    }
    
    // Create new log window
    logWindows[type] = new BrowserWindow({
      width: 1000,
      height: 700,
      title: `${type === 'backend' ? 'Backend' : 'Frontend'} Logs`,
      icon: path.join(__dirname, 'icons', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: true,
        contextIsolation: false
      },
      backgroundColor: '#1e1e1e'
    });
    
    // Check if logViewer.html exists
    const logViewerPath = path.join(__dirname, 'logViewer.html');
    if (!fs.existsSync(logViewerPath)) {
      log.error(`Log viewer HTML not found at ${logViewerPath}`);
      // Create a simple fallback content
      logWindows[type].loadURL(`data:text/html,
        <html>
          <head><title>Logs</title></head>
          <body style="background: #1e1e1e; color: white; padding: 20px; font-family: monospace;">
            <h2>${type === 'backend' ? 'Backend' : 'Frontend'} Logs</h2>
            <pre id="logs">No log viewer HTML found. Logs would appear here.</pre>
          </body>
        </html>
      `);
    } else {
      // Load log viewer HTML with type parameter
      logWindows[type].loadFile(logViewerPath, {
        query: { type }
      });
    }
    
    // Handle window closed
    logWindows[type].on('closed', () => {
      logWindows[type] = null;
    });
    
    // Send initial logs if available
    if (processManager) {
      const logs = processManager.getLogs(type) || [];
      logWindows[type].webContents.on('did-finish-load', () => {
        logs.forEach(log => {
          logWindows[type].webContents.send('log-data', {
            type,
            text: log.text,
            timestamp: log.timestamp
          });
        });
      });
    }
  } catch (error) {
    log.error('Error creating log window:', error);
  }
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
          label: 'Backend Logs',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            createLogWindow('backend');
          }
        },
        {
          label: 'Frontend Logs',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            createLogWindow('frontend');
          }
        },
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
  
  // Create loading window first
  createLoadingWindow();
  
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
  
  // Set up log forwarding to log windows and loading window
  processManager.addLogListener((logData) => {
    // Send to appropriate log window if open
    if (logWindows[logData.type] && !logWindows[logData.type].isDestroyed()) {
      logWindows[logData.type].webContents.send('log-data', logData);
    }
    
    // Send progress to loading window
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      const text = logData.text || '';
      // Filter for relevant startup messages
      if (text.includes('Starting') || text.includes('Listening') || 
          text.includes('Ready') || text.includes('Connected') ||
          text.includes('server') || text.includes('INFO') ||
          text.includes('Loading') || text.includes('Initialized')) {
        // Clean up the message for display
        let cleanMessage = text;
        // Remove timestamp if present
        const timestampMatch = text.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
        if (timestampMatch) {
          cleanMessage = text.substring(text.indexOf(timestampMatch[0]) + timestampMatch[0].length + 1);
        }
        // Remove log level prefixes
        cleanMessage = cleanMessage.replace(/^\s*\|\s*(INFO|DEBUG|WARNING|ERROR)\s*\|/, '');
        // Truncate if too long
        if (cleanMessage.length > 80) {
          cleanMessage = cleanMessage.substring(0, 77) + '...';
        }
        loadingWindow.webContents.send('loading-progress', cleanMessage.trim());
      }
    }
  });

  // Make startServices accessible globally for retry
  startServicesFunc = async function() {
    let backendStarted = false;
    let frontendStarted = false;
    
    try {
      // Start backend server with timeout
      log.info('Starting backend server...');
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.send('loading-status', 'Starting backend server...');
        loadingWindow.webContents.send('loading-progress', 'Initializing Python environment...');
      }
      
      // Add timeout wrapper for backend
      const backendTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Backend startup timed out after 20 seconds')), 20000)
      );
      
      try {
        await Promise.race([
          processManager.startBackend(),
          backendTimeout
        ]);
        backendStarted = true;
        log.info('Backend started successfully');
      } catch (error) {
        log.error('Backend failed to start:', error);
        throw new Error(`Backend failed to start: ${error.message}`);
      }

      // Start frontend with timeout
      log.info('Starting frontend server...');
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.send('loading-status', 'Starting frontend server...');
        loadingWindow.webContents.send('loading-progress', 'Building Next.js application...');
      }
      
      // Add timeout wrapper for frontend
      const frontendTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Frontend startup timed out after 20 seconds')), 20000)
      );
      
      try {
        await Promise.race([
          processManager.startFrontend(),
          frontendTimeout
        ]);
        frontendStarted = true;
        log.info('Frontend started successfully');
      } catch (error) {
        log.error('Frontend failed to start:', error);
        throw new Error(`Frontend failed to start: ${error.message}`);
      }

      // Verify both servers are actually running
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.send('loading-status', 'Verifying services...');
        loadingWindow.webContents.send('loading-progress', 'Checking server health...');
      }
      
      // Quick health check
      let serversHealthy = false;
      for (let i = 0; i < 10; i++) {
        try {
          // Check backend health
          const backendResponse = await fetch('http://127.0.0.1:8000/health').catch(() => null);
          // Check frontend (Next.js usually runs on 3000)
          const frontendResponse = await fetch('http://127.0.0.1:3000').catch(() => null);
          
          if (backendResponse && frontendResponse) {
            serversHealthy = true;
            break;
          }
        } catch (e) {
          // Ignore errors, we'll retry
        }
        
        if (i < 9) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (!serversHealthy) {
        throw new Error('Servers started but are not responding to health checks');
      }

      // Wait a bit for servers to fully initialize
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.send('loading-status', 'Loading application...');
        loadingWindow.webContents.send('loading-progress', 'Services ready, opening main window...');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create main window
      createWindow();
    } catch (error) {
      log.error('Failed to start services:', error);
      
      // Try to clean up any partially started services
      if (backendStarted || frontendStarted) {
        log.info('Cleaning up partially started services...');
        await processManager.stopAll().catch(e => log.error('Error during cleanup:', e));
      }
      
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        let errorMessage = error.message || 'Unknown error occurred';
        
        // Add more helpful error messages
        if (errorMessage.includes('Backend')) {
          errorMessage += '\n\nThe Python server failed to start. This could be due to missing dependencies or a port conflict.';
        } else if (errorMessage.includes('Frontend')) {
          errorMessage += '\n\nThe Next.js server failed to start. This could be due to missing node modules or a build error.';
        } else if (errorMessage.includes('health check')) {
          errorMessage += '\n\nThe servers started but are not responding. There may be a configuration issue.';
        }
        
        loadingWindow.webContents.send('loading-error', errorMessage);
      }
    }
  }
  
  // Start the services
  startServicesFunc();
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

// Store startServices function globally so it can be accessed by IPC handlers
let startServicesFunc = null;

// IPC handlers for log viewer
ipcMain.on('request-logs', (event, { type }) => {
  if (processManager) {
    const logs = processManager.getLogs(type);
    logs.forEach(log => {
      event.reply('log-data', {
        type,
        text: log.text,
        timestamp: log.timestamp
      });
    });
  }
});

// Loading window IPC handlers - define these early before app.whenReady
ipcMain.on('retry-start', async () => {
  log.info('Retrying service startup...');
  if (processManager) {
    // Stop any running processes
    log.info('Stopping existing processes...');
    await processManager.stopAll().catch(e => log.error('Error stopping processes:', e));
    
    // Wait a moment for processes to fully stop
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Call the stored startServices function if available
    if (startServicesFunc && typeof startServicesFunc === 'function') {
      log.info('Restarting services...');
      startServicesFunc();
    } else {
      log.error('startServices function not available for retry');
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.send('loading-error', 
          'Unable to retry - please restart the application');
      }
    }
  } else {
    log.warn('ProcessManager not available for retry');
  }
});

ipcMain.on('view-logs', () => {
  log.info('View logs requested');
  // Create a backend log window to view the startup logs
  // Check if we can create the window
  if (BrowserWindow) {
    createLogWindow('backend');
  } else {
    log.error('Cannot create log window - BrowserWindow not available');
  }
});

ipcMain.on('exit-app', () => {
  log.info('Exit app requested');
  // Force quit the app
  if (processManager) {
    processManager.stopAll().then(() => {
      app.quit();
    }).catch(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
});