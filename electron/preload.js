const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// specific Node.js and Electron functionalities in a safe way
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform information
  platform: process.platform,
  
  // Version information
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  
  // Listen for menu actions
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => {
      callback(action);
    });
  },
  
  // Remove menu action listener
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  }
});

// Log that preload script has loaded
console.log('Preload script loaded');

// Prevent any Node.js or Electron APIs from being accessible in the renderer
// This is a security best practice
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - Electron wrapper active');
});