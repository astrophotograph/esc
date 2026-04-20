import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Zustand persist middleware requires a working localStorage.
// jsdom's implementation may not be fully usable; provide a real mock.
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ResizeObserver is required by recharts ResponsiveContainer but not in jsdom
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Mock Intl.supportedValuesOf so LocationPicker doesn't fail in jsdom
if (!('supportedValuesOf' in Intl)) {
  Object.defineProperty(Intl, 'supportedValuesOf', {
    value: (_: string) => ['UTC', 'America/New_York', 'America/Chicago', 'Europe/London'],
    writable: true,
  })
}

// Cleanup after each test
afterEach(() => {
  cleanup()
  localStorageMock.clear()
})
