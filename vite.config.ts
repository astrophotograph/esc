import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST

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
    port: 5173,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host: host,
          port: 5183,
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
