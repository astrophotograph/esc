import '@testing-library/jest-dom'
import 'jest-localstorage-mock'
import fetchMock from 'jest-fetch-mock'

// Enable fetch mocking
fetchMock.enableMocks()

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {
    return null
  }
  disconnect() {
    return null
  }
  unobserve() {
    return null
  }
}

// Mock EventSource
global.EventSource = class EventSource {
  constructor() {
    this.onmessage = null
    this.onerror = null
  }
  close() {}
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Reset mocks before each test
beforeEach(() => {
  fetchMock.resetMocks()
  localStorage.clear()
  sessionStorage.clear()
})

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
})