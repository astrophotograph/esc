import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { TelescopeProvider } from '../context/TelescopeContext'
import { TelescopeInfo, Equipment, ObservationLogEntry, Session } from '../types/telescope-types'

// Mock data factories
export const mockTelescope = (overrides?: Partial<TelescopeInfo>): TelescopeInfo => ({
  id: 'test-telescope-1',
  name: 'Test Telescope',
  host: '192.168.1.100',
  port: 4700,
  connected: true,
  serial_number: 'TEST123',
  product_model: 'Seestar S50',
  ssid: 'SEESTAR_TEST',
  status: 'online',
  last_seen: new Date().toISOString(),
  ...overrides,
})

export const mockEquipment = (overrides?: Partial<Equipment>): Equipment => ({
  id: `equipment-${Date.now()}`,
  name: 'Test Telescope',
  type: 'telescope',
  brand: 'Test Brand',
  model: 'Test Model',
  purchaseDate: '2024-01-01',
  notes: 'Test equipment',
  compatibility: ['Seestar S50'],
  maintenanceIntervalHours: 100,
  lastMaintenanceDate: '2024-01-01',
  totalUsageHours: 50,
  ...overrides,
})

export const mockObservation = (overrides?: Partial<ObservationLogEntry>): ObservationLogEntry => ({
  id: `obs-${Date.now()}`,
  timestamp: new Date().toISOString(),
  target: 'Test Target',
  duration: 60,
  notes: 'Test observation',
  weather: {
    temperature: 20,
    humidity: 50,
    windSpeed: 5,
    conditions: 'clear',
  },
  equipment: ['equipment-1'],
  settings: {
    exposure: 30,
    gain: 50,
    filter: 'none',
  },
  ...overrides,
})

export const mockSession = (overrides?: Partial<Session>): Session => ({
  id: `session-${Date.now()}`,
  name: 'Test Session',
  startTime: new Date().toISOString(),
  endTime: null,
  observations: [],
  totalObservingTime: 0,
  equipment: [],
  weather: {
    temperature: 20,
    humidity: 50,
    windSpeed: 5,
    conditions: 'clear',
  },
  location: {
    name: 'Test Location',
    latitude: 40.7128,
    longitude: -74.0060,
    timezone: 'America/New_York',
  },
  notes: 'Test session notes',
  ...overrides,
})

// Custom render function that provides TelescopeContext
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  contextValue?: any
}

export function renderWithContext(
  ui: ReactElement,
  { contextValue, ...renderOptions }: CustomRenderOptions = {}
) {
  const defaultContextValue = {
    telescopes: [mockTelescope()],
    currentTelescope: mockTelescope(),
    setCurrentTelescope: jest.fn(),
    isControlsCollapsed: false,
    setIsControlsCollapsed: jest.fn(),
    brightness: [100],
    setBrightness: jest.fn(),
    contrast: [100],
    setContrast: jest.fn(),
    exposure: [30],
    setExposure: jest.fn(),
    gain: [50],
    setGain: jest.fn(),
    focusPosition: 0,
    setFocusPosition: jest.fn(),
    isImaging: false,
    setIsImaging: jest.fn(),
    isTracking: false,
    setIsTracking: jest.fn(),
    systemStats: {
      diskUsage: 45,
      freeMB: 1000,
      totalMB: 2000,
    },
    setSystemStats: jest.fn(),
    imageStats: {
      mean: 128,
      std: 45,
      max: 255,
      min: 0,
    },
    setImageStats: jest.fn(),
    observationLogs: [],
    setObservationLogs: jest.fn(),
    sessions: [],
    setSessions: jest.fn(),
    currentSession: null,
    setCurrentSession: jest.fn(),
    equipment: [],
    setEquipment: jest.fn(),
    activeEquipment: [],
    setActiveEquipment: jest.fn(),
    selectedTarget: null,
    handleTargetSelect: jest.fn(),
    celestialObjects: [],
    setCelestialObjects: jest.fn(),
    showAnnotations: false,
    setShowAnnotations: jest.fn(),
    annotationSettings: {
      display: {
        showNames: true,
        showMagnitudes: true,
        showConstellations: true,
        showCatalogIds: false,
        fontSize: 'medium',
        opacity: 0.8,
      },
      behavior: {
        clickToSelect: true,
        autoHide: false,
        hoverDetails: true,
      },
      filters: {
        minMagnitude: -5,
        maxMagnitude: 10,
        types: ['star', 'planet', 'nebula', 'cluster', 'double-star'],
        constellations: [],
      },
    },
    setAnnotationSettings: jest.fn(),
    notifications: [],
    addNotification: jest.fn(),
    removeNotification: jest.fn(),
    notificationSettings: {
      enabled: true,
      playSound: true,
      showDesktop: true,
      types: {
        info: true,
        warning: true,
        error: true,
        success: true,
      },
    },
    setNotificationSettings: jest.fn(),
    planningPanels: [],
    setPlanningPanels: jest.fn(),
    showOverlay: false,
    setShowOverlay: jest.fn(),
    showStatsPanel: false,
    setShowStatsPanel: jest.fn(),
    showLogPanel: false,
    setShowLogPanel: jest.fn(),
    liveViewFullscreen: false,
    setLiveViewFullscreen: jest.fn(),
    pipPosition: { x: 20, y: 20 },
    setPipPosition: jest.fn(),
    showStreamStatus: false,
    setShowStreamStatus: jest.fn(),
    streamStatus: { connected: false, frameRate: 0, latency: 0 },
    setStreamStatus: jest.fn(),
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <TelescopeProvider initialState={{ ...defaultContextValue, ...contextValue }}>
      {children}
    </TelescopeProvider>
  )

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// Helper to wait for async operations
export const waitForLoadingToFinish = async () => {
  const { waitFor } = await import('@testing-library/react')
  await waitFor(() => {
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })
}

// Mock SSE helper
export const createMockSSE = () => {
  const mockSSE = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    close: jest.fn(),
    dispatchEvent: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    sendMessage: (data: any) => {
      if (mockSSE.onmessage) {
        const event = new MessageEvent('message', { data: JSON.stringify(data) })
        mockSSE.onmessage(event)
      }
    },
    sendError: () => {
      if (mockSSE.onerror) {
        const event = new Event('error')
        mockSSE.onerror(event)
      }
    },
  }
  return mockSSE
}

// LocalStorage test helpers
export const mockLocalStorage = () => {
  const store: { [key: string]: string } = {}
  
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key]
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key])
    }),
    get length() {
      return Object.keys(store).length
    },
    key: jest.fn((index: number) => {
      const keys = Object.keys(store)
      return keys[index] || null
    }),
  }
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react'