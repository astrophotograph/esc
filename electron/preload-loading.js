const { contextBridge, ipcRenderer } = require('electron');

console.log('Loading preload script initialized');

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
  retryStart: () => {
    console.log('Sending retry-start IPC message');
    ipcRenderer.send('retry-start');
  },
  viewLogs: () => {
    console.log('Sending view-logs IPC message');
    ipcRenderer.send('view-logs');
  },
  exitApp: () => {
    console.log('Sending exit-app IPC message');
    ipcRenderer.send('exit-app');
  },
  forceKillPorts: () => {
    console.log('Sending force-kill-ports IPC message');
    ipcRenderer.send('force-kill-ports');
  }
});

console.log('electronAPI exposed to window');