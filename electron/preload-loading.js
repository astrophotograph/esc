const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods for the loading window
contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for status updates
  onLoadingStatus: (callback) => {
    ipcRenderer.on('loading-status', (event, status) => callback(status));
  },
  
  // Listen for progress messages
  onLoadingProgress: (callback) => {
    ipcRenderer.on('loading-progress', (event, progress) => callback(progress));
  },
  
  // Listen for errors
  onLoadingError: (callback) => {
    ipcRenderer.on('loading-error', (event, error) => callback(error));
  },
  
  // Actions
  retryStart: () => ipcRenderer.send('retry-start'),
  viewLogs: () => ipcRenderer.send('view-logs'),
  exitApp: () => ipcRenderer.send('exit-app')
});