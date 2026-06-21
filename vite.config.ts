import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST
const webApiTarget = process.env.VITE_WEB_API_TARGET || 'http://127.0.0.1:9846'

// Only pin the HMR websocket to an *explicit, routable* host. When the dev
// server binds 0.0.0.0 (e.g. `run-dev.sh --web` with the default host) a remote
// browser must not be told to dial ws://0.0.0.0:9283 — leaving this undefined
// makes Vite infer the host from the browser's location and serve HMR over the
// dev-server port instead, which works for both local and remote clients.
const hmrHost = host && host !== '0.0.0.0' ? host : undefined

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },

  // Configuration for Tauri mode
  clearScreen: false,
  server: {
    // Bind all interfaces when a dev host is given, or in web mode, so the app
    // is reachable from other devices on the network.
    host: host || mode === 'web',
    port: 9273,
    strictPort: true,
    hmr: hmrHost
      ? {
          protocol: 'ws',
          host: hmrHost,
          port: 9283,
        }
      : undefined,
    proxy:
      mode === 'web'
        ? {
            '/api': { target: webApiTarget, changeOrigin: true },
            '/stream': { target: webApiTarget, changeOrigin: true },
            '/snapshot': { target: webApiTarget, changeOrigin: true },
          }
        : undefined,
  },

  // Build configuration differs for web vs desktop
  build: {
    target: mode === 'web' ? 'esnext' : ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: mode === 'web' ? 'dist-web' : 'dist',
  },

  envPrefix: ['VITE_', 'TAURI_'],
}))
