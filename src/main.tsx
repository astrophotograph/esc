import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { initializeTauriEvents } from './services/tauriEvents'
import { ThemeProvider } from './contexts/ThemeContext'
import { initializeFontScaling } from './hooks/useFontScaling'

// Initialize font scaling early to prevent flash of unstyled content
initializeFontScaling();

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
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
