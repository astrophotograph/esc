import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST
const webApiTarget = process.env.VITE_WEB_API_TARGET || 'http://127.0.0.1:9846'

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
    host: host || false,
    port: 9273,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host: host,
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
