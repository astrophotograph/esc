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

export const mockCelestialObject = (overrides?: any) => ({
  id: `celestial-${Date.now()}`,
  name: 'Andromeda Galaxy',
  type: 'galaxy',
  magnitude: 3.4,
  ra: '00h 42m 44s',
  dec: '+41° 16\' 09"',
  bestSeenIn: 'Autumn',
  description: 'The nearest major galaxy to the Milky Way',
  optimalMoonPhase: 'new',
  isCurrentlyVisible: true,
  ...overrides,
})

export const mockMaintenanceRecord = (overrides?: any) => ({
  id: `maintenance-${Date.now()}`,
  equipmentId: 'equipment-1',
  date: new Date().toISOString(),
  type: 'cleaning',
  description: 'Cleaned telescope lenses',
  cost: 0,
  nextDueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  completed: true,
  ...overrides,
})

export const mockEquipmentSet = (overrides?: any) => ({
  id: `set-${Date.now()}`,
  name: 'Deep Sky Setup',
  description: 'Equipment for deep sky imaging',
  equipmentIds: ['equipment-1', 'equipment-2'],
  totalWeight: 5.2,
  estimatedSetupTime: 30,
  isActive: false,
  ...overrides,
})

// Custom render function that provides TelescopeContext
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  contextValue?: any
}

// Full default context value based on actual TelescopeContext
export const createMockTelescopeContext = (overrides: any = {}) => ({
  // Telescope Management
  telescopes: [mockTelescope()],
  currentTelescope: mockTelescope(),
  isLoadingTelescopes: false,
  telescopeError: null,
  fetchTelescopes: jest.fn(),
  selectTelescope: jest.fn(),

  // UI State
  showOverlay: false,
  setShowOverlay: jest.fn(),
  exposure: [30],
  setExposure: jest.fn(),
  gain: [50],
  setGain: jest.fn(),
  brightness: [100],
  setBrightness: jest.fn(),
  contrast: [100],
  setContrast: jest.fn(),
  focusPosition: [0],
  setFocusPosition: jest.fn(),
  isTracking: false,
  setIsTracking: jest.fn(),
  imageStats: {
    mean: 128,
    std: 45,
    max: 255,
    min: 0,
  },
  setImageStats: jest.fn(),
  isControlsCollapsed: false,
  setIsControlsCollapsed: jest.fn(),
  selectedTarget: null,
  setSelectedTarget: jest.fn(),
  observationNotes: '',
  setObservationNotes: jest.fn(),
  observationRating: 0,
  setObservationRating: jest.fn(),
  showLogPanel: false,
  setShowLogPanel: jest.fn(),
  showStatsPanel: false,
  setShowStatsPanel: jest.fn(),
  showKeyboardHelp: false,
  setShowKeyboardHelp: jest.fn(),
  showPlanningPanel: false,
  setShowPlanningPanel: jest.fn(),
  searchQuery: '',
  setSearchQuery: jest.fn(),

  // Session Management
  activeSession: null,
  setActiveSession: jest.fn(),
  sessionNotes: '',
  setSessionNotes: jest.fn(),
  sessionLocation: '',
  setSessionLocation: jest.fn(),
  sessionEquipment: '',
  setSessionEquipment: jest.fn(),
  sessionTimer: 0,
  setSessionTimer: jest.fn(),
  sessionTimerRef: { current: null },
  startSession: jest.fn(),
  pauseSession: jest.fn(),
  resumeSession: jest.fn(),
  endSession: jest.fn(),
  pastSessions: [],
  setPastSessions: jest.fn(),

  // Planning
  planningView: 'calendar' as const,
  setPlanningView: jest.fn(),
  selectedDate: new Date(),
  setSelectedDate: jest.fn(),
  newSessionTitle: '',
  setNewSessionTitle: jest.fn(),
  newSessionStartTime: '',
  setNewSessionStartTime: jest.fn(),
  newSessionEndTime: '',
  setNewSessionEndTime: jest.fn(),
  newSessionLocation: '',
  setNewSessionLocation: jest.fn(),
  newSessionNotes: '',
  setNewSessionNotes: jest.fn(),
  newSessionPriority: 'medium' as const,
  setNewSessionPriority: jest.fn(),
  plannedSessions: [],
  setPlannedSessions: jest.fn(),

  // System Stats
  systemStats: {
    diskUsage: 45,
    freeMB: 1000,
    totalMB: 2000,
    temperature: 15,
    weather: {
      condition: 'clear',
      seeingCondition: 'good',
      humidity: 45,
    },
  },
  setSystemStats: jest.fn(),

  // Notifications
  notificationPermission: 'default' as NotificationPermission,
  setNotificationPermission: jest.fn(),
  showNotificationSettings: false,
  setShowNotificationSettings: jest.fn(),
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
  scheduledNotifications: [],
  setScheduledNotifications: jest.fn(),
  notificationHistory: [],
  setNotificationHistory: jest.fn(),
  showNotificationHistory: false,
  setShowNotificationHistory: jest.fn(),

  // Location Management
  showLocationManager: false,
  setShowLocationManager: jest.fn(),
  observingLocations: [],
  setObservingLocations: jest.fn(),
  currentObservingLocation: null,
  setCurrentObservingLocation: jest.fn(),

  // Celestial Data
  celestialObjects: [],
  setCelestialObjects: jest.fn(),
  celestialEvents: [],
  setCelestialEvents: jest.fn(),
  weatherForecast: [],
  setWeatherForecast: jest.fn(),

  // Observation Log
  observationLog: [],
  setObservationLog: jest.fn(),
  saveObservation: jest.fn(),

  // Data Management
  showDataManagementSettings: false,
  setShowDataManagementSettings: jest.fn(),
  showCelestialSearch: false,
  setShowCelestialSearch: jest.fn(),

  // Equipment Management
  showEquipmentManager: false,
  setShowEquipmentManager: jest.fn(),
  equipment: [],
  setEquipment: jest.fn(),
  maintenanceRecords: [],
  setMaintenanceRecords: jest.fn(),
  equipmentSets: [],
  setEquipmentSets: jest.fn(),
  selectedEquipmentIds: [],
  setSelectedEquipmentIds: jest.fn(),

  // Tab Activity
  tabActivity: { activeCount: 1, lastActivity: Date.now() },
  setTabActivity: jest.fn(),

  // Picture-in-Picture
  showPiP: false,
  setShowPiP: jest.fn(),
  pipPosition: { x: 20, y: 20 },
  setPipPosition: jest.fn(),
  pipSize: 'medium' as const,
  setPipSize: jest.fn(),
  pipCamera: 'allsky' as const,
  setPipCamera: jest.fn(),
  pipMinimized: false,
  setPipMinimized: jest.fn(),
  pipFullscreen: false,
  setPipFullscreen: jest.fn(),
  liveViewFullscreen: false,
  setLiveViewFullscreen: jest.fn(),
  pipOverlaySettings: {
    crosshairs: {
      enabled: false,
      color: '#ff0000',
      thickness: 2,
      style: 'simple' as const,
    },
    grid: {
      enabled: false,
      color: '#ffffff',
      spacing: 50,
      opacity: 0.5,
      style: 'lines' as const,
    },
    measurements: {
      enabled: false,
      color: '#00ff00',
      showScale: true,
      showCoordinates: true,
      unit: 'arcmin' as const,
    },
    compass: {
      enabled: false,
      color: '#0000ff',
      showCardinals: true,
      showDegrees: false,
    },
  },
  setPipOverlaySettings: jest.fn(),
  showPipOverlayControls: false,
  setShowPipOverlayControls: jest.fn(),
  allskyUrls: {},
  setAllskyUrls: jest.fn(),
  showPipStatus: false,
  setShowPipStatus: jest.fn(),
  showStreamStatus: false,
  setShowStreamStatus: jest.fn(),
  streamStatus: { connected: false, frameRate: 0, latency: 0 },
  setStreamStatus: jest.fn(),
  isImaging: false,
  setIsImaging: jest.fn(),

  // Annotations
  annotationSettings: {
    enabled: false,
    showLabels: true,
    showMagnitudes: true,
    showConstellations: true,
    minMagnitude: -5,
    maxMagnitude: 10,
    objectTypes: {
      stars: true,
      galaxies: true,
      nebulae: true,
      clusters: true,
      planets: true,
      moons: true,
      doubleStars: true,
      variableStars: true,
      asteroids: true,
      comets: true,
    },
    appearance: {
      circleColor: '#ffffff',
      labelColor: '#ffffff',
      circleOpacity: 0.7,
      labelOpacity: 0.9,
      circleThickness: 2,
      fontSize: 12,
      showConnectorLines: true,
    },
    behavior: {
      fadeOnHover: true,
      clickToSelect: true,
      autoHide: false,
      autoHideDelay: 5000,
    },
  },
  setAnnotationSettings: jest.fn(),
  showAnnotations: false,
  setShowAnnotations: jest.fn(),

  // Functions
  addStatusAlert: jest.fn(),
  dismissAlert: jest.fn(),
  scheduleNotification: jest.fn(),
  cancelNotification: jest.fn(),
  sendNotification: jest.fn(),
  addNotificationToHistory: jest.fn(),
  clearNotificationHistory: jest.fn(),
  exportData: jest.fn(),
  importData: jest.fn(),
  resetAllData: jest.fn(),
  addEquipment: jest.fn(),
  updateEquipment: jest.fn(),
  deleteEquipment: jest.fn(),
  addMaintenanceRecord: jest.fn(),
  updateMaintenanceRecord: jest.fn(),
  deleteMaintenanceRecord: jest.fn(),
  createEquipmentSet: jest.fn(),
  updateEquipmentSet: jest.fn(),
  deleteEquipmentSet: jest.fn(),
  loadEquipmentSet: jest.fn(),

  ...overrides,
})

export function renderWithContext(
  ui: ReactElement,
  { contextValue, ...renderOptions }: CustomRenderOptions = {}
) {
  const mockContext = createMockTelescopeContext(contextValue)

  // Mock the useTelescopeContext hook
  const MockProvider = ({ children }: { children: React.ReactNode }) => {
    // Mock the actual hook
    jest.doMock('../context/TelescopeContext', () => ({
      useTelescopeContext: () => mockContext,
      TelescopeProvider: ({ children }: { children: React.ReactNode }) => children,
    }))
    
    return <>{children}</>
  }

  return render(ui, { wrapper: MockProvider, ...renderOptions })
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