import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { initializeTauriEvents } from './services/tauriEvents'

// Initialize Tauri event listeners
initializeTauriEvents().then((unlisteners) => {
  console.log("Tauri events initialized");

  // Cleanup on window unload
  window.addEventListener('beforeunload', () => {
    unlisteners.forEach(unlisten => unlisten());
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
