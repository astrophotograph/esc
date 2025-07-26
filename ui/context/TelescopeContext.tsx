"use client"

import type React from "react"

import { createContext, useContext, useState, useRef, type ReactNode, useEffect } from "react"
import { toast } from "sonner"
import { usePersistentState } from "../hooks/use-persistent-state"
import { STORAGE_KEYS, loadFromStorage } from "../utils/storage-utils"
import type {
  CelestialObject,
  Session,
  StatusAlert,
  ObservationLogEntry,
  SystemStats,
  ImageStats,
  NotificationSettings,
  ScheduledNotification,
  NotificationHistory,
  PlannedSession,
  WeatherForecast,
  CelestialEvent,
  Equipment,
  MaintenanceRecord,
  EquipmentSet,
  TelescopeInfo,
  RemoteController,
  AddRemoteControllerRequest,
} from "../types/telescope-types"
import type { ObservingLocation } from "../location-management"
import { sampleCelestialObjects, sampleCelestialEvents, sampleWeatherForecast } from "../data/sample-data"
import { useTelescopeWebSocket } from "../hooks/useTelescopeWebSocket"

export interface Annotation {
  type: string;
  pixelx: number;
  pixely: number;
  radius: number;
  name: string;
  names: string[];
}

interface PipOverlaySettings {
  crosshairs: {
    enabled: boolean
    color: string
    thickness: number
    style: "simple" | "circle" | "target"
  }
  grid: {
    enabled: boolean
    color: string
    spacing: number
    opacity: number
    style: "lines" | "dots"
  }
  measurements: {
    enabled: boolean
    color: string
    showScale: boolean
    showCoordinates: boolean
    unit: "arcmin" | "arcsec" | "pixels"
  }
  compass: {
    enabled: boolean
    color: string
    showCardinals: boolean
    showDegrees: boolean
  }
}

interface AnnotationSettings {
  enabled: boolean
  showLabels: boolean
  showMagnitudes: boolean
  showConstellations: boolean
  minMagnitude: number
  maxMagnitude: number
  objectTypes: {
    stars: boolean
    galaxies: boolean
    nebulae: boolean
    clusters: boolean
    planets: boolean
    moons: boolean
    doubleStars: boolean
    variableStars: boolean
    asteroids: boolean
    comets: boolean
  }
  appearance: {
    circleColor: string
    labelColor: string
    circleOpacity: number
    labelOpacity: number
    circleThickness: number
    fontSize: number
    showConnectorLines: boolean
  }
  behavior: {
    fadeOnHover: boolean
    clickToSelect: boolean
    autoHide: boolean
    autoHideDelay: number
  }
}

interface TelescopeContextType {
  // Telescope Management
  telescopes: TelescopeInfo[]
  currentTelescope: TelescopeInfo | null
  isLoadingTelescopes: boolean
  telescopeError: string | null
  fetchTelescopes: () => Promise<void>
  selectTelescope: (telescope: TelescopeInfo, showNotification?: boolean) => void
  addManualTelescope: (telescope: Omit<TelescopeInfo, 'id'>) => Promise<void>
  removeManualTelescope: (telescopeId: string) => Promise<void>
  showTelescopeManagement: boolean
  setShowTelescopeManagement: (show: boolean) => void

  // Remote Controller Management
  remoteControllers: RemoteController[]
  isLoadingRemoteControllers: boolean
  fetchRemoteControllers: () => Promise<void>
  addRemoteController: (controller: AddRemoteControllerRequest) => Promise<void>
  removeRemoteController: (host: string, port: number) => Promise<void>
  reconnectRemoteController: (host: string, port: number) => Promise<void>

  // State
  showOverlay: boolean
  setShowOverlay: (show: boolean) => void
  exposure: number[]
  setExposure: (exposure: number[]) => void
  gain: number[]
  setGain: (gain: number[]) => void
  brightness: number[]
  setBrightness: (brightness: number[]) => void
  contrast: number[]
  setContrast: (contrast: number[]) => void
  connectionType: 'webrtc' | 'mjpeg' | 'disconnected'
  setConnectionType: (type: 'webrtc' | 'mjpeg' | 'disconnected') => void
  focusPosition: number[]
  setFocusPosition: (position: number[]) => void
  isTracking: boolean
  setIsTracking: (tracking: boolean) => void
  imageStats: ImageStats
  setImageStats: (stats: ImageStats) => void
  isControlsCollapsed: boolean
  setIsControlsCollapsed: (collapsed: boolean) => void
  selectedTarget: CelestialObject | null
  setSelectedTarget: (target: CelestialObject | null) => void
  observationNotes: string
  setObservationNotes: (notes: string) => void
  observationRating: number
  setObservationRating: (rating: number) => void
  showLogPanel: boolean
  setShowLogPanel: (show: boolean) => void
  showStatsPanel: boolean
  setShowStatsPanel: (show: boolean) => void
  showKeyboardHelp: boolean
  setShowKeyboardHelp: (show: boolean) => void
  showDocumentation: boolean
  setShowDocumentation: (show: boolean) => void
  showConfiguration: boolean
  setShowConfiguration: (show: boolean) => void
  showPlanningPanel: boolean
  setShowPlanningPanel: (show: boolean) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  activeSession: Session | null
  setActiveSession: (session: Session | null) => void
  sessionNotes: string
  setSessionNotes: (notes: string) => void
  sessionLocation: string
  setSessionLocation: (location: string) => void
  sessionEquipment: string
  setSessionEquipment: (equipment: string) => void
  sessionTimer: number
  setSessionTimer: (timer: number) => void
  planningView: "calendar" | "events" | "weather" | "create"
  setPlanningView: (view: "calendar" | "events" | "weather" | "create") => void
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  newSessionTitle: string
  setNewSessionTitle: (title: string) => void
  newSessionStartTime: string
  setNewSessionStartTime: (time: string) => void
  newSessionEndTime: string
  setNewSessionEndTime: (time: string) => void
  newSessionLocation: string
  setNewSessionLocation: (location: string) => void
  newSessionNotes: string
  setNewSessionNotes: (notes: string) => void
  newSessionPriority: "high" | "medium" | "low"
  setNewSessionPriority: (priority: "high" | "medium" | "low") => void
  plannedSessions: PlannedSession[]
  setPlannedSessions: (sessions: PlannedSession[]) => void
  sessionTimerRef: React.MutableRefObject<NodeJS.Timeout | null>
  systemStats: SystemStats
  setSystemStats: (stats: SystemStats) => void
  notificationPermission: NotificationPermission
  setNotificationPermission: (permission: NotificationPermission) => void
  showNotificationSettings: boolean
  setShowNotificationSettings: (show: boolean) => void
  notificationSettings: NotificationSettings
  setNotificationSettings: (settings: NotificationSettings) => void
  scheduledNotifications: ScheduledNotification[]
  setScheduledNotifications: (notifications: ScheduledNotification[]) => void
  notificationHistory: NotificationHistory[]
  setNotificationHistory: (history: NotificationHistory[]) => void
  showNotificationHistory: boolean
  setShowNotificationHistory: (show: boolean) => void
  showLocationManager: boolean
  setShowLocationManager: (show: boolean) => void
  observingLocations: ObservingLocation[]
  setObservingLocations: (locations: ObservingLocation[]) => void
  currentObservingLocation: ObservingLocation | null
  setCurrentObservingLocation: (location: ObservingLocation | null) => void
  celestialObjects: CelestialObject[]
  setCelestialObjects: (objects: CelestialObject[]) => void
  celestialEvents: CelestialEvent[]
  setCelestialEvents: (events: CelestialEvent[]) => void
  weatherForecast: WeatherForecast[]
  setWeatherForecast: (forecast: WeatherForecast[]) => void
  observationLog: ObservationLogEntry[]
  setObservationLog: (log: ObservationLogEntry[]) => void
  pastSessions: Session[]
  setPastSessions: (sessions: Session[]) => void
  showDataManagementSettings: boolean
  setShowDataManagementSettings: (show: boolean) => void
  showCelestialSearch: boolean
  setShowCelestialSearch: (show: boolean) => void
  showEquipmentManager: boolean
  setShowEquipmentManager: (show: boolean) => void
  equipment: Equipment[]
  setEquipment: (equipment: Equipment[]) => void
  maintenanceRecords: MaintenanceRecord[]
  setMaintenanceRecords: (records: MaintenanceRecord[]) => void
  equipmentSets: EquipmentSet[]
  setEquipmentSets: (sets: EquipmentSet[]) => void
  selectedEquipmentIds: string[]
  setSelectedEquipmentIds: (ids: string[]) => void
  tabActivity: TabActivityState
  setTabActivity: (activity: TabActivityState) => void
  // Picture-in-Picture state
  showPiP: boolean
  setShowPiP: (show: boolean) => void
  pipPosition: { x: number; y: number }
  setPipPosition: (position: { x: number; y: number }) => void
  pipSize: "small" | "medium" | "large" | "extra-large"
  setPipSize: (size: "small" | "medium" | "large" | "extra-large") => void
  pipCamera: "allsky" | "guide" | "finder"
  setPipCamera: (camera: "allsky" | "guide" | "finder") => void
  pipMinimized: boolean
  setPipMinimized: (minimized: boolean) => void
  pipFullscreen: boolean
  setPipFullscreen: (fullscreen: boolean) => void
  liveViewFullscreen: boolean
  setLiveViewFullscreen: (fullscreen: boolean) => void
  pipOverlaySettings: PipOverlaySettings
  setPipOverlaySettings: (settings: PipOverlaySettings) => void
    showPipOverlayControls: boolean
    setShowPipOverlayControls: (show: boolean) => void
    allskyUrls: Record<string, string>
    setAllskyUrls: (urls: Record<string, string>) => void
    showPipStatus: boolean
    setShowPipStatus: (show: boolean) => void
    showStreamStatus: boolean
    setShowStreamStatus: (show: boolean) => void
    streamStatus: any
    setStreamStatus: (status: any) => void
    isImaging: boolean
    setIsImaging: (imaging: boolean) => void
    annotationSettings: AnnotationSettings
    setAnnotationSettings: (settings: AnnotationSettings) => void
    showAnnotations: boolean
    setShowAnnotations: (show: boolean) => void
    currentAnnotations: Annotation[]
    setCurrentAnnotations: (annotations: Annotation[]) => void
    showStarmap: boolean
    setShowStarmap: (show: boolean) => void
    starmapSize: "small" | "medium" | "large" | "extra-large"
    setStarmapSize: (size: "small" | "medium" | "large" | "extra-large") => void
    showChalkboard: boolean
    setShowChalkboard: (show: boolean) => void
    starmapFullscreen: boolean
    setStarmapFullscreen: (fullscreen: boolean) => void
    starmapMinimized: boolean
    setStarmapMinimized: (minimized: boolean) => void
    starmapPosition: { x: number; y: number }
    setStarmapPosition: (position: { x: number; y: number }) => void

  // Functions
  addStatusAlert: (alert: Omit<StatusAlert, "id" | "timestamp" | "dismissed">) => void
  handleTelescopeMove: (direction: string) => void
  handleTelescopePark: () => void
  handleFocusAdjust: (direction: "in" | "out") => void
  handleGotoTarget: (targetName: string, ra: number, dec: number, startImaging?: boolean, targetType?: string, magnitude?: number, description?: string) => Promise<void>
  handleSceneryMode: () => Promise<void>
  handleTargetSelect: (target: CelestialObject) => void
  handlePlateSolve: (apiKey?: string) => Promise<any>
  handleSyncTelescope: (ra: number, dec: number) => Promise<any>
  saveObservation: () => void
  deleteObservation: (id: string) => void
  startSession: () => void
  pauseSession: () => void
  resumeSession: () => void
  endSession: () => void
  createPlannedSession: () => void
  handleKeyDown: (event: KeyboardEvent) => void
}

interface TabActivityState {
  session: {
    isActive: boolean
    hasNotifications: boolean
    count?: number
  }
  targets: {
    hasRecommendations: boolean
    count?: number
  }
  observation: {
    hasUnsavedChanges: boolean
    recentCount?: number
  }
  telescope: {
    isMoving: boolean
    hasIssues: boolean
    needsAttention: boolean
  }
  environment: {
    hasAlerts: boolean
    conditionChange: boolean
  }
  equipment: {
    hasIssues: boolean
    needsMaintenance: boolean
    count?: number
  }
}

const TelescopeContext = createContext<TelescopeContextType | undefined>(undefined)

export function TelescopeProvider({ children }: { children: ReactNode }) {
  // Telescope Management State
  const [telescopes, setTelescopes] = useState<TelescopeInfo[]>([])

  // Remote Controller Management State
  const [remoteControllers, setRemoteControllers] = useState<RemoteController[]>([])
  const [isLoadingRemoteControllers, setIsLoadingRemoteControllers] = useState(false)

  // Validation function for saved telescope data
  const validateSavedTelescope = (telescope: any): telescope is TelescopeInfo => {
    if (!telescope || typeof telescope !== 'object') {
      console.warn('Invalid telescope data: not an object')
      return false
    }

    // Check for required fields
    if (!telescope.name && !telescope.serial_number && !telescope.id) {
      console.warn('Invalid telescope data: missing identifying fields')
      return false
    }

    // Validate data types
    if (telescope.name && typeof telescope.name !== 'string') {
      console.warn('Invalid telescope data: name is not a string')
      return false
    }

    if (telescope.serial_number && typeof telescope.serial_number !== 'string') {
      console.warn('Invalid telescope data: serial_number is not a string')
      return false
    }

    if (telescope.host && typeof telescope.host !== 'string') {
      console.warn('Invalid telescope data: host is not a string')
      return false
    }

    // console.log('Telescope data validation passed:', telescope.name || telescope.id)
    return true
  }

  const [rawCurrentTelescope, setRawCurrentTelescope] = usePersistentState<TelescopeInfo | null>(
    STORAGE_KEYS.CURRENT_TELESCOPE,
    null
  )

  // Validated current telescope (ensure saved data is valid)
  const currentTelescope = rawCurrentTelescope && validateSavedTelescope(rawCurrentTelescope)
    ? rawCurrentTelescope
    : null

  const setCurrentTelescope = (telescope: TelescopeInfo | null) => {
    if (telescope && !validateSavedTelescope(telescope)) {
      console.error('Attempted to save invalid telescope data:', telescope)
      return
    }
    setRawCurrentTelescope(telescope)
  }


  const [isLoadingTelescopes, setIsLoadingTelescopes] = useState(false)
  const [telescopeError, setTelescopeError] = useState<string | null>(null)
  const [showTelescopeManagement, setShowTelescopeManagement] = useState(false)

  // State variables
  const [showOverlay, setShowOverlay] = useState(true)
  const [exposure, setExposure] = useState([1.0])
  const [gain, setGain] = useState([50])
  const [brightness, setBrightness] = useState([0])
  const [contrast, setContrast] = useState([100])
  const [focusPosition, setFocusPosition] = useState([5000])
  const [isTracking, setIsTracking] = useState(true)
  const [connectionType, setConnectionType] = useState<'webrtc' | 'mjpeg' | 'disconnected'>('disconnected')
  const [imageStats, setImageStats] = useState<ImageStats>({
    mean: 128.5,
    std: 45.2,
    min: 12,
    max: 255,
    histogram: Array.from({ length: 10 }, () => Math.random() * 100),
  })
  const [isControlsCollapsed, setIsControlsCollapsed] = usePersistentState(STORAGE_KEYS.UI_STATE + "-controls-collapsed", false)
  const [selectedTarget, setSelectedTarget] = useState<CelestialObject | null>(null)
  const [observationNotes, setObservationNotes] = useState("")
  const [observationRating, setObservationRating] = useState(3)
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [showStatsPanel, setShowStatsPanel] = useState(false)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [showDocumentation, setShowDocumentation] = useState(false)
  const [showConfiguration, setShowConfiguration] = useState(false)
  const [showPlanningPanel, setShowPlanningPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [sessionNotes, setSessionNotes] = useState("")
  const [sessionLocation, setSessionLocation] = useState("")
  const [sessionEquipment, setSessionEquipment] = useState("")
  const [sessionTimer, setSessionTimer] = useState(0)
  const [planningView, setPlanningView] = useState<"calendar" | "events" | "weather" | "create">("calendar")
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [newSessionTitle, setNewSessionTitle] = useState("")
  const [newSessionStartTime, setNewSessionStartTime] = useState("20:00")
  const [newSessionEndTime, setNewSessionEndTime] = useState("23:00")
  const [newSessionLocation, setNewSessionLocation] = useState("")
  const [newSessionNotes, setNewSessionNotes] = useState("")
  const [newSessionPriority, setNewSessionPriority] = useState<"high" | "medium" | "low">("medium")
  const [plannedSessions, setPlannedSessions] = useState<PlannedSession[]>([])
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null)

  // WebSocket hook for telescope control and status
  const {
    moveTelescope: wsMoveTelescope,
    parkTelescope: wsParkTelescope,
    adjustFocus: wsAdjustFocus,
    sendGotoMessage: wsSendGotoMessage,
    enableSceneryMode: wsEnableSceneryMode,
    isConnected: wsIsConnected,
    connectionState: wsConnectionState,
    connect: wsConnect,
    disconnect: wsDisconnect,
  } = useTelescopeWebSocket({
    autoConnect: false
  });

  const [systemStats, setSystemStats] = useState<SystemStats>({
    battery: 85,
    temperature: 23.5,
    diskUsage: 67,
    weather: {
      condition: "Clear",
      humidity: 45,
      windSpeed: 8.2,
      seeingCondition: "Good",
      seeingValue: 2.1, // arcseconds
    },
    moon: {
      phase: "Waxing Gibbous",
      illumination: 78.5,
      age: 10.2, // days since new moon
      rise: "18:45",
      set: "06:23",
      isVisible: true,
    },
  })
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default")
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    enabled: true,
    sessionReminders: {
      enabled: true,
      advanceTime: 30, // 30 minutes before
    },
    weatherAlerts: {
      enabled: true,
      goodConditions: true,
      badConditions: true,
      threshold: 70, // notify when score above/below this
    },
    celestialEvents: {
      enabled: true,
      advanceTime: 2, // 2 hours before
      eventTypes: ["moon_phase", "planet_opposition", "meteor_shower", "eclipse"],
    },
    systemAlerts: {
      enabled: true,
      batteryLow: true,
      storageHigh: true,
      equipmentIssues: true,
    },
    quietHours: {
      enabled: false,
      startTime: "22:00",
      endTime: "08:00",
    },
  })
  const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotification[]>([])
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistory[]>([])
  const [showNotificationHistory, setShowNotificationHistory] = useState(false)
  const [showLocationManager, setShowLocationManager] = useState(false)
  const [observingLocations, setObservingLocations] = useState<ObservingLocation[]>([
    {
      id: "home-1",
      name: "Backyard Observatory",
      description: "My home setup with permanent pier and power",
      coordinates: { latitude: 40.7128, longitude: -74.006, elevation: 50 },
      lightPollution: { bortle: 6, sqm: 18.5, description: "Bright suburban sky" },
      weather: {
        averageSeeing: "fair",
        windExposure: "sheltered",
        temperatureRange: { min: 5, max: 25 },
        humidity: 60,
      },
      accessibility: {
        driveTime: 0,
        difficulty: "easy",
        facilities: ["Parking", "Restrooms", "Power"],
        restrictions: [],
      },
      equipment: { powerAvailable: true, internetAccess: true, shelter: true, setupSpace: "medium" },
      settings: {
        defaultEquipment: '8" Dobsonian, DSLR camera',
        preferredTargets: [],
        notes: "Great for planetary work, limited deep sky due to light pollution",
        isDefault: true,
        isFavorite: true,
      },
      metadata: {
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        lastUsed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        timesUsed: 15,
        averageRating: 4.2,
      },
      type: "home",
    },
    {
      id: "dark-1",
      name: "Cherry Springs State Park",
      description: "International Dark Sky Park with excellent conditions",
      coordinates: { latitude: 41.6628, longitude: -77.8267, elevation: 670 },
      lightPollution: { bortle: 2, sqm: 21.8, description: "Typical truly dark site" },
      weather: {
        averageSeeing: "excellent",
        windExposure: "moderate",
        temperatureRange: { min: -5, max: 20 },
        humidity: 45,
      },
      accessibility: {
        driveTime: 120,
        difficulty: "moderate",
        facilities: ["Parking", "Restrooms"],
        restrictions: ["Permit required", "Seasonal access"],
      },
      equipment: { powerAvailable: false, internetAccess: false, shelter: false, setupSpace: "large" },
      settings: {
        defaultEquipment: '10" SCT, CCD camera, filters',
        preferredTargets: [],
        notes: "Best site for deep sky imaging. Bring warm clothes and portable power.",
        isDefault: false,
        isFavorite: true,
      },
      metadata: {
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        lastUsed: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        timesUsed: 8,
        averageRating: 4.9,
      },
      type: "dark_site",
    },
  ])
  const [currentObservingLocation, setCurrentObservingLocation] = useState<ObservingLocation | null>(() => {
    // Check for saved browser location first
    const savedBrowserLocation = loadFromStorage<ObservingLocation | null>("telescope-browser-location", null)
    if (savedBrowserLocation) {
      return savedBrowserLocation
    }
    // Otherwise, use default location
    return observingLocations.find((loc) => loc.settings.isDefault) || null
  })
  const [celestialObjects, setCelestialObjects] = useState<CelestialObject[]>(sampleCelestialObjects)
  const [celestialEvents, setCelestialEvents] = useState<CelestialEvent[]>(sampleCelestialEvents)
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast[]>(sampleWeatherForecast)
  const [showDataManagementSettings, setShowDataManagementSettings] = useState(false)
  const [showCelestialSearch, setShowCelestialSearch] = useState(false)
  const [showEquipmentManager, setShowEquipmentManager] = useState(false)
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([])
  const [tabActivity, setTabActivity] = useState<TabActivityState>({
    session: { isActive: false, hasNotifications: false },
    targets: { hasRecommendations: true, count: 5 },
    observation: { hasUnsavedChanges: false },
    telescope: { isMoving: false, hasIssues: false, needsAttention: false },
    environment: { hasAlerts: false, conditionChange: false },
    equipment: { hasIssues: false, needsMaintenance: true, count: 2 },
  })

  // All-sky camera URLs per telescope
  const [allskyUrls, setAllskyUrls] = usePersistentState<Record<string, string>>(STORAGE_KEYS.UI_STATE + "-allsky-urls", {})

  // Show status in PiP
  const [showPipStatus, setShowPipStatus] = useState(true)

  // Show stream status in main view
  const [showStreamStatus, setShowStreamStatus] = usePersistentState(STORAGE_KEYS.UI_STATE + "-show-stream-status", true)

  // Stream status
  const [streamStatus, setStreamStatus] = useState<any>(null)

  // Imaging state
  const [isImaging, setIsImaging] = useState(false)

  // Picture-in-Picture state
  const [showPiP, setShowPiP] = usePersistentState(STORAGE_KEYS.UI_STATE + "-show-pip", false)
  const [pipPosition, setPipPosition] = usePersistentState(STORAGE_KEYS.UI_STATE + "-pip-position", { x: 20, y: 20 })
  const [pipSize, setPipSize] = usePersistentState<"small" | "medium" | "large" | "extra-large">(STORAGE_KEYS.UI_STATE + "-pip-size", "medium")
  const [pipCamera, setPipCamera] = usePersistentState<"allsky" | "guide" | "finder">(STORAGE_KEYS.UI_STATE + "-pip-camera", "allsky")
  const [pipMinimized, setPipMinimized] = usePersistentState(STORAGE_KEYS.UI_STATE + "-pip-minimized", false)
  const [pipFullscreen, setPipFullscreen] = usePersistentState(STORAGE_KEYS.UI_STATE + "-pip-fullscreen", false)
  const [liveViewFullscreen, setLiveViewFullscreen] = useState(false)
  const [pipOverlaySettings, setPipOverlaySettings] = usePersistentState<PipOverlaySettings>(STORAGE_KEYS.UI_STATE + "-pip-overlay-settings", {
    crosshairs: {
      enabled: false,
      color: "#ff0000",
      thickness: 2,
      style: "simple",
    },
    grid: {
      enabled: false,
      color: "#00ff00",
      spacing: 50,
      opacity: 0.5,
      style: "lines",
    },
    measurements: {
      enabled: false,
      color: "#ffff00",
      showScale: true,
      showCoordinates: false,
      unit: "arcmin",
    },
    compass: {
      enabled: false,
      color: "#00ffff",
      showCardinals: true,
      showDegrees: false,
    },
  })
  const [showPipOverlayControls, setShowPipOverlayControls] = useState(false)

  // Equipment management state
  const [equipment, setEquipment] = useState<Equipment[]>([
    {
      id: "eq-1",
      name: "Primary Telescope",
      type: "telescope",
      brand: "Celestron",
      model: "EdgeHD 8",
      serialNumber: "CH12345",
      condition: "excellent",
      description: "8-inch Schmidt-Cassegrain telescope with EdgeHD optics",
      specifications: {
        aperture: 203.2,
        focalLength: 2032,
        focalRatio: 10,
        weight: 6.8,
      },
      compatibility: {},
      location: { storage: "Observatory", isPortable: true, weight: 6.8 },
      usage: { totalSessions: 25, totalHours: 150, averageRating: 4.8 },
      maintenance: {
        lastMaintenance: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        nextMaintenance: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        maintenanceInterval: 90,
      },
      settings: { isFavorite: true, isActive: false },
      metadata: {
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    },
    {
      id: "eq-2",
      name: "DSLR Camera",
      type: "camera",
      brand: "Canon",
      model: "EOS 6D Mark II",
      condition: "good",
      description: "Full-frame DSLR camera for astrophotography",
      specifications: {
        sensor: "Full Frame CMOS",
        resolution: "26.2 MP",
        iso: "100-40000",
      },
      compatibility: {},
      location: { storage: "Camera bag", isPortable: true, weight: 0.765 },
      usage: { totalSessions: 20, totalHours: 80, averageRating: 4.5 },
      maintenance: {},
      settings: { isFavorite: true, isActive: false },
      metadata: {
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    },
    {
      id: "eq-3",
      name: "EQ Mount",
      type: "mount",
      brand: "Sky-Watcher",
      model: "EQ6-R Pro",
      condition: "excellent",
      description: "Computerized equatorial mount with GoTo capability",
      specifications: {
        payload: 20,
        weight: 17,
        goto: true,
        tracking: "Sidereal, Lunar, Solar",
      },
      compatibility: {},
      location: { storage: "Observatory", isPortable: false, weight: 17 },
      usage: { totalSessions: 30, totalHours: 200, averageRating: 4.9 },
      maintenance: {
        lastMaintenance: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        nextMaintenance: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        maintenanceInterval: 90,
      },
      settings: { isFavorite: true, isActive: false },
      metadata: {
        createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    },
  ])

  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([
    {
      id: "maint-1",
      equipmentId: "eq-1",
      type: "cleaning",
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      description: "Cleaned primary mirror and checked collimation",
      performedBy: "User",
      beforeCondition: "good",
      afterCondition: "excellent",
      notes: "Mirror was slightly dusty but collimation was perfect",
    },
    {
      id: "maint-2",
      equipmentId: "eq-3",
      type: "calibration",
      date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      description: "Polar alignment and GoTo calibration",
      performedBy: "User",
      beforeCondition: "good",
      afterCondition: "excellent",
      notes: "Improved tracking accuracy significantly",
    },
  ])

  const [equipmentSets, setEquipmentSets] = useState<EquipmentSet[]>([
    {
      id: "set-1",
      name: "Deep Sky Imaging Setup",
      description: "Complete setup for deep sky astrophotography",
      equipmentIds: ["eq-1", "eq-2", "eq-3"],
      purpose: "Deep Sky Imaging",
      isDefault: true,
      createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      lastUsed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      timesUsed: 15,
    },
    {
      id: "set-2",
      name: "Visual Observing",
      description: "Setup for visual astronomy sessions",
      equipmentIds: ["eq-1", "eq-3"],
      purpose: "Visual Observing",
      isDefault: false,
      createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000),
      lastUsed: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      timesUsed: 8,
    },
  ])

  // Initialize with some sample observation data
  const [observationLog, setObservationLog] = useState<ObservationLogEntry[]>([
    {
      id: "1",
      timestamp: new Date(Date.now() - 86400000 * 2), // 2 days ago
      target: celestialObjects[0], // M31
      notes: "Excellent view of the galaxy core. Could see dust lanes with averted vision.",
      rating: 5,
      equipmentUsed: ["eq-1", "eq-3"],
      settings: { exposure: 2.5, gain: 45, brightness: 5, contrast: 110, focusPosition: 4800 },
      conditions: {
        weather: "Clear",
        seeing: "Excellent",
        moonPhase: "New Moon",
        moonIllumination: 5,
        temperature: 18.5,
      },
    },
    {
      id: "2",
      timestamp: new Date(Date.now() - 86400000 * 1), // 1 day ago
      target: celestialObjects[3], // Jupiter
      notes: "Great detail in cloud bands. Io and Europa clearly visible.",
      rating: 4,
      equipmentUsed: ["eq-1", "eq-3"],
      settings: { exposure: 0.5, gain: 30, brightness: -10, contrast: 120, focusPosition: 5200 },
      conditions: {
        weather: "Clear",
        seeing: "Good",
        moonPhase: "Waxing Crescent",
        moonIllumination: 25,
        temperature: 22.1,
      },
    },
    // More sample data...
  ])

  // Initialize with a sample session
  const [pastSessions, setPastSessions] = useState<Session[]>([
    {
      id: "session-1",
      startTime: new Date(Date.now() - 86400000 * 3), // 3 days ago
      endTime: new Date(Date.now() - 86400000 * 3 + 3600000 * 3), // 3 hours later
      location: "Backyard Observatory",
      equipment: '8" Dobsonian, 25mm & 10mm eyepieces, UHC filter',
      equipmentUsed: ["eq-1", "eq-3"],
      notes: "Great night with excellent transparency. Focused on Messier objects.",
      conditions: {
        weather: "Clear",
        seeing: "Good",
        temperature: 18.5,
        humidity: 45,
      },
    },
    // More sample data...
  ])

  // Telescope Management Functions
  const fetchTelescopes = async () => {
    setIsLoadingTelescopes(true)
    setTelescopeError(null)

    try {
      const response = await fetch('/api/telescopes')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const rawData = await response.json()

      // Transform API data to match UI interface
      const transformedTelescopes: TelescopeInfo[] = rawData.map((telescope: any) => ({
        ...telescope,
        // Add computed properties for UI compatibility
        id: telescope.serial_number || telescope.name,
        status: telescope.connected ? 'online' : 'offline',
        type: telescope.product_model,
        isConnected: telescope.connected,
        description: `${telescope.host}:${telescope.port} on ${telescope.ssid}`,
        host: `${telescope.host}:${telescope.port}`,
        location: telescope.location || `Network: ${telescope.ssid}`,
        ssid: telescope.ssid,
        // Derive isManual from discovery_method (default to false if not specified)
        isManual: telescope.discovery_method === 'manual'
      }))

      setTelescopes(transformedTelescopes)

      // Restore previously selected telescope or auto-select first one
      if (transformedTelescopes.length > 0) {
        if (currentTelescope) {
          // Enhanced telescope matching with validation
          const findTelescopeMatch = (saved: TelescopeInfo, telescopes: TelescopeInfo[]) => {
            // Priority 1: Match by serial number (most reliable)
            if (saved.serial_number) {
              const match = telescopes.find(t => t.serial_number === saved.serial_number)
              if (match) {
                console.log(`Telescope matched by serial number: ${match.name} (${match.serial_number})`)
                return { telescope: match, confidence: 'high' as const }
              }
            }

            // Priority 2: Match by computed ID (fallback for devices without serial)
            if (saved.id) {
              const match = telescopes.find(t => t.id === saved.id)
              if (match) {
                console.log(`Telescope matched by ID: ${match.name} (${match.id})`)
                return { telescope: match, confidence: 'medium' as const }
              }
            }

            // Priority 3: Match by name and host (least reliable due to network changes)
            if (saved.name && saved.host) {
              const match = telescopes.find(t => t.name === saved.name && t.host === saved.host)
              if (match) {
                console.log(`Telescope matched by name+host: ${match.name} (${match.host})`)
                return { telescope: match, confidence: 'low' as const }
              }
            }

            // Removed Priority 4: Match by name only - too unreliable and causes random switching
            // This was causing issues when multiple telescopes have similar names

            return null
          }

          try {
            console.log(`Attempting to restore telescope: ${currentTelescope.name || currentTelescope.id || 'unknown'}`)
            console.log(`Available telescopes: ${transformedTelescopes.map(t => `${t.name} (${t.serial_number || 'no-serial'})`).join(', ')}`)

            const matchResult = findTelescopeMatch(currentTelescope, transformedTelescopes)

            if (matchResult) {
              const { telescope: savedTelescope, confidence } = matchResult

              // Only update if the telescope data has meaningfully changed
              const hasChanged =
                currentTelescope.status !== savedTelescope.status ||
                currentTelescope.isConnected !== savedTelescope.isConnected ||
                currentTelescope.host !== savedTelescope.host ||
                currentTelescope.description !== savedTelescope.description

              if (hasChanged) {
                // Update with fresh telescope data while maintaining the selection
                setCurrentTelescope(savedTelescope)
                console.log(`Updated telescope data: ${savedTelescope.name} (confidence: ${confidence})`)

                // Only show notification on first load or high confidence matches to reduce noise
                const isFirstConnection = currentTelescope.status !== savedTelescope.status && savedTelescope.status === 'online';

                if (isFirstConnection && (confidence === 'high' || confidence === 'medium')) {
                  setTimeout(() => {
                    addStatusAlert({
                      type: 'info',
                      title: 'Welcome Back',
                      message: `Reconnected to ${savedTelescope.name}`
                    })
                  }, 1000) // Delay to avoid showing immediately on load
                }
              } else {
                console.log(`Telescope data unchanged: ${savedTelescope.name} (confidence: ${confidence})`)
              }
            } else {
              // Previously selected telescope no longer available
              console.warn(`Previous telescope not found: ${currentTelescope.name || currentTelescope.id || 'unknown'}`)

              // Don't auto-switch during periodic refresh - only switch on first load or user action
              // This prevents random switching when telescopes temporarily disappear from API
              const isInitialLoad = telescopes.length === 0; // First time loading telescopes

              if (isInitialLoad) {
                setCurrentTelescope(transformedTelescopes[0])
                console.log(`Auto-selected first available telescope (initial load): ${transformedTelescopes[0].name}`)

                // Show notification about telescope change
                setTimeout(() => {
                  addStatusAlert({
                    type: 'warning',
                    title: 'Telescope Changed',
                    message: `Previous telescope not available, switched to ${transformedTelescopes[0].name}`
                  })
                }, 1000)
              } else {
                // Keep current selection even if telescope temporarily disappears
                console.log(`Keeping current telescope selection despite temporary unavailability`)
              }
            }
          } catch (error) {
            console.error('Error during telescope restoration:', error)
            // Fallback to first telescope on restoration error
            setCurrentTelescope(transformedTelescopes[0])
            console.log(`Fallback to first telescope due to error: ${transformedTelescopes[0].name}`)
          }
        } else {
          // No previous selection, auto-select first telescope
          setCurrentTelescope(transformedTelescopes[0])
          console.log(`Auto-selected first telescope: ${transformedTelescopes[0].name}`)
        }
      }
    } catch (error) {
      console.error('Failed to fetch telescopes:', error)
      setTelescopeError(error instanceof Error ? error.message : 'Failed to fetch telescopes')
      // Use sample data as fallback
      const sampleTelescopes: TelescopeInfo[] = [
        {
          name: 'cfcf05c4',
          host: '192.168.42.41',
          port: 4700,
          connected: true,
          serial_number: 'cfcf05c4',
          product_model: 'Seestar S30',
          ssid: 'S30_cfcf05c4',
          id: 'cfcf05c4',
          status: 'online',
          type: 'Seestar S30',
          isConnected: true,
          description: 'Seestar S30 at 192.168.42.41:4700',
          location: 'Network: S30_cfcf05c4'
        }
      ]
      setTelescopes(sampleTelescopes)

      // Handle telescope selection for sample data (same logic as above)
      if (currentTelescope) {
        const savedTelescope = sampleTelescopes.find(
          t => t.id === currentTelescope.id ||
               t.serial_number === currentTelescope.serial_number ||
               (t.host === currentTelescope.host && t.name === currentTelescope.name)
        )

        if (savedTelescope) {
          setCurrentTelescope(savedTelescope)
          console.log(`Restored telescope selection (sample): ${savedTelescope.name}`)

          // Show a subtle notification about the restoration (sample data)
          setTimeout(() => {
            addStatusAlert({
              type: 'info',
              title: 'Welcome Back',
              message: `Reconnected to ${savedTelescope.name} (demo mode)`
            })
          }, 1000)
        } else {
          setCurrentTelescope(sampleTelescopes[0])
          console.log(`Previous telescope not found in samples, selected: ${sampleTelescopes[0].name}`)
        }
      } else {
        setCurrentTelescope(sampleTelescopes[0])
        console.log(`Auto-selected sample telescope: ${sampleTelescopes[0].name}`)
      }
    } finally {
      setIsLoadingTelescopes(false)
    }
  }

  const selectTelescope = (telescope: TelescopeInfo, showNotification: boolean = true) => {
    setCurrentTelescope(telescope)

    if (showNotification) {
      addStatusAlert({
        type: 'info',
        title: 'Telescope Selected',
        message: `Connected to ${telescope.name}`
      })
    }
  }

  const addManualTelescope = async (telescope: Omit<TelescopeInfo, 'id'>) => {
    try {
      // Call the API to add the telescope
      const response = await fetch('/api/telescopes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...telescope,
          discovery_method: 'manual',
        }),
      })

      if (!response.ok) {
        // If backend doesn't support manual telescopes, fall back to local storage
        if (response.status === 404 || response.status === 405) {
          console.warn('Backend does not support manual telescope management, using local fallback')

          const newTelescope: TelescopeInfo = {
            ...telescope,
            id: `manual-${Date.now()}`,
            discovery_method: 'manual',
            isManual: true,
          }

          setTelescopes(prev => [...prev, newTelescope])

          addStatusAlert({
            type: 'success',
            title: 'Telescope Added',
            message: `Successfully added ${telescope.name} (local storage)`
          })
          return
        }
        throw new Error(`Failed to add telescope: ${response.status}`)
      }

      // Refresh the telescope list to get the updated data from server
      await fetchTelescopes()

      addStatusAlert({
        type: 'success',
        title: 'Telescope Added',
        message: `Successfully added ${telescope.name}`
      })
    } catch (error) {
      console.error('Error adding manual telescope:', error)
      addStatusAlert({
        type: 'error',
        title: 'Failed to Add Telescope',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      throw error
    }
  }

  const removeManualTelescope = async (telescopeId: string) => {
    try {
      // Call the API to remove the telescope
      const response = await fetch(`/api/telescopes?id=${encodeURIComponent(telescopeId)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        // If backend doesn't support manual telescopes, fall back to local storage
        if (response.status === 404 || response.status === 405) {
          console.warn('Backend does not support manual telescope management, using local fallback')

          setTelescopes(prev => prev.filter(t => t.id !== telescopeId))

          // If the removed telescope was selected, clear selection
          if (currentTelescope?.id === telescopeId) {
            setCurrentTelescope(null)
          }

          addStatusAlert({
            type: 'info',
            title: 'Telescope Removed',
            message: 'Successfully removed telescope (local storage)'
          })
          return
        }
        throw new Error(`Failed to remove telescope: ${response.status}`)
      }

      // If the removed telescope was selected, clear selection
      if (currentTelescope?.id === telescopeId) {
        setCurrentTelescope(null)
      }

      // Refresh the telescope list to get the updated data from server
      await fetchTelescopes()

      addStatusAlert({
        type: 'info',
        title: 'Telescope Removed',
        message: 'Successfully removed telescope'
      })
    } catch (error) {
      console.error('Error removing telescope:', error)
      addStatusAlert({
        type: 'error',
        title: 'Failed to Remove Telescope',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      throw error
    }
  }

  // Add a status alert using toast system
  const addStatusAlert = (alert: Omit<StatusAlert, "id" | "timestamp" | "dismissed">) => {
    // Use Sonner toast with appropriate styling based on alert type
    if (alert.type === "error") {
      toast.error(alert.title, {
        description: alert.message,
        duration: 8000, // Longer duration for error messages so users can read them
      })
    } else if (alert.type === "success") {
      toast.success(alert.title, {
        description: alert.message,
        duration: 4000,
      })
    } else if (alert.type === "warning") {
      toast.warning(alert.title, {
        description: alert.message,
        duration: 4000,
      })
    } else {
      toast.info(alert.title, {
        description: alert.message,
        duration: 3000,
      })
    }
  }

  // Remote Controller Management Functions
  const fetchRemoteControllers = async () => {
    setIsLoadingRemoteControllers(true)
    try {
      const response = await fetch('/api/remote-controllers')
      if (!response.ok) {
        throw new Error(`Failed to fetch remote controllers: ${response.status}`)
      }
      const data = await response.json()
      setRemoteControllers(data)
    } catch (error) {
      console.error('Failed to fetch remote controllers:', error)
      addStatusAlert({
        type: 'error',
        title: 'Failed to Load Remote Controllers',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    } finally {
      setIsLoadingRemoteControllers(false)
    }
  }

  const addRemoteController = async (controller: AddRemoteControllerRequest) => {
    try {
      const response = await fetch('/api/remote-controllers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(controller),
      })

      if (!response.ok) {
        throw new Error(`Failed to add remote controller: ${response.status}`)
      }

      // Refresh the remote controller list and telescopes
      await Promise.all([fetchRemoteControllers(), fetchTelescopes()])

      addStatusAlert({
        type: 'success',
        title: 'Remote Controller Added',
        message: `Successfully added remote controller at ${controller.host}:${controller.port}`
      })
    } catch (error) {
      console.error('Error adding remote controller:', error)
      addStatusAlert({
        type: 'error',
        title: 'Failed to Add Remote Controller',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      throw error
    }
  }

  const removeRemoteController = async (host: string, port: number) => {
    try {
      const response = await fetch(`/api/remote-controllers/${encodeURIComponent(host)}/${port}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`Failed to remove remote controller: ${response.status}`)
      }

      // Refresh the remote controller list and telescopes
      await Promise.all([fetchRemoteControllers(), fetchTelescopes()])

      addStatusAlert({
        type: 'info',
        title: 'Remote Controller Removed',
        message: `Successfully removed remote controller at ${host}:${port}`
      })
    } catch (error) {
      console.error('Error removing remote controller:', error)
      addStatusAlert({
        type: 'error',
        title: 'Failed to Remove Remote Controller',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      throw error
    }
  }

  const reconnectRemoteController = async (host: string, port: number) => {
    try {
      const response = await fetch(`/api/remote-controllers/${encodeURIComponent(host)}/${port}/reconnect`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to reconnect remote controller: ${response.status}`)
      }

      // Refresh the remote controller list and telescopes
      await Promise.all([fetchRemoteControllers(), fetchTelescopes()])

      addStatusAlert({
        type: 'success',
        title: 'Remote Controller Reconnected',
        message: `Successfully reconnected to remote controller at ${host}:${port}`
      })
    } catch (error) {
      console.error('Error reconnecting remote controller:', error)
      addStatusAlert({
        type: 'error',
        title: 'Failed to Reconnect Remote Controller',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
      throw error
    }
  }

  // Monitor for invalid telescope data and clear it
  useEffect(() => {
    if (rawCurrentTelescope && !validateSavedTelescope(rawCurrentTelescope)) {
      console.warn('Clearing invalid telescope data from storage:', rawCurrentTelescope)
      setRawCurrentTelescope(null)
      addStatusAlert({
        type: 'warning',
        title: 'Data Reset',
        message: 'Invalid telescope data was cleared. Please reselect your telescope.'
      })
    }
  }, [rawCurrentTelescope])

  // Manage WebSocket connection based on current telescope
  useEffect(() => {
    const connectToTelescope = async () => {
      if (currentTelescope && !wsIsConnected) {
        try {
          console.log('🔌 Connecting to WebSocket for telescope:', currentTelescope.name)
          await wsConnect(currentTelescope)
          console.log('✅ WebSocket connected successfully')
        } catch (error) {
          console.error('❌ Failed to connect WebSocket:', error)
          addStatusAlert({
            type: 'error',
            title: 'Connection Failed',
            message: `Failed to connect to ${currentTelescope.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          })
        }
      } else if (!currentTelescope && wsIsConnected) {
        console.log('🔌 Disconnecting WebSocket (no telescope selected)')
        wsDisconnect()
      }
    }

    connectToTelescope()
  }, [currentTelescope, wsIsConnected, wsConnect, wsDisconnect])

  const handleTelescopeMove = async (direction: string) => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before moving",
      })
      return
    }

    if (!wsIsConnected) {
      addStatusAlert({
        type: "error",
        title: "WebSocket Not Connected",
        message: `Cannot move telescope - WebSocket connection state: ${wsConnectionState}`,
      })
      return
    }

    try {
      await wsMoveTelescope(direction, currentTelescope)

      // Add status alert for telescope movement
      if (direction !== "stop") {
        addStatusAlert({
          type: "info",
          title: "Telescope Moving",
          message: `Moving telescope ${direction}`,
        })
      } else {
        addStatusAlert({
          type: "info",
          title: "Telescope Stopped",
          message: "Telescope movement stopped",
        })
      }
    } catch (error) {
      console.error('Error moving telescope via WebSocket:', error)
      addStatusAlert({
        type: "error",
        title: "Movement Failed",
        message: `Failed to move telescope: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleTelescopePark = async () => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before parking",
      })
      return
    }

    if (!wsIsConnected) {
      addStatusAlert({
        type: "error",
        title: "WebSocket Not Connected",
        message: `Cannot park telescope - WebSocket connection state: ${wsConnectionState}`,
      })
      return
    }

    try {
      await wsParkTelescope(currentTelescope)

      addStatusAlert({
        type: "success",
        title: "Telescope Parking",
        message: "Telescope is moving to park position",
      })
    } catch (error) {
      console.error('Error parking telescope via WebSocket:', error)
      addStatusAlert({
        type: "error",
        title: "Park Failed",
        message: `Failed to park telescope: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleFocusAdjust = async (direction: "in" | "out") => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before adjusting focus",
      })
      return
    }

    if (!wsIsConnected) {
      addStatusAlert({
        type: "error",
        title: "WebSocket Not Connected",
        message: `Cannot adjust focus - WebSocket connection state: ${wsConnectionState}`,
      })
      return
    }

    const increment = direction === "in" ? -10 : 10

    try {
      await wsAdjustFocus(direction, currentTelescope)

      addStatusAlert({
        type: "info",
        title: "Focus Adjusting",
        message: `Moving focus ${direction} by ${Math.abs(increment)} steps`,
      })
    } catch (error) {
      console.error('Error adjusting focus via WebSocket:', error)
      addStatusAlert({
        type: "error",
        title: "Focus Adjustment Failed",
        message: `Failed to adjust focus: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleGotoTarget = async (
    targetName: string,
    ra: number,
    dec: number,
    startImaging: boolean = false,
    targetType?: string,
    magnitude?: number,
    description?: string
  ) => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before sending goto command",
      })
      return
    }

    if (!wsIsConnected) {
      addStatusAlert({
        type: "error",
        title: "WebSocket Not Connected",
        message: `Cannot send goto command - WebSocket connection state: ${wsConnectionState}`,
      })
      return
    }

    try {
      await wsSendGotoMessage(targetName, ra, dec, startImaging, targetType, magnitude, description, currentTelescope)

      addStatusAlert({
        type: "success",
        title: startImaging ? "Goto & Imaging Started" : "Goto Command Sent",
        message: `Telescope navigating to ${targetName}${startImaging ? ' and starting imaging' : ''}`,
      })
    } catch (error) {
      console.error('Error sending goto command via WebSocket:', error)
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Provide more specific error messages based on error type
      let title = "Goto Command Failed"
      let message = `Failed to send goto command: ${errorMessage}`
      
      if (errorMessage.includes('Command timeout')) {
        title = "Goto Command Timed Out"
        message = `Goto command took too long to complete. This is normal for large telescope movements. Please check telescope status.`
      } else if (errorMessage.includes('WebSocket not connected')) {
        title = "Connection Lost"
        message = "Cannot send goto command - WebSocket connection lost. Attempting to reconnect..."
      }
      
      addStatusAlert({
        type: "error",
        title,
        message,
      })
    }
  }

  const handleSceneryMode = async () => {
    if (!currentTelescope) {
      addStatusAlert({
        type: "error",
        title: "No Telescope Selected",
        message: "Please select a telescope before enabling scenery mode",
      })
      return
    }

    if (!wsIsConnected) {
      addStatusAlert({
        type: "error",
        title: "WebSocket Not Connected",
        message: `Cannot enable scenery mode - WebSocket connection state: ${wsConnectionState}`,
      })
      return
    }

    try {
      await wsEnableSceneryMode(currentTelescope)

      addStatusAlert({
        type: "success",
        title: "Scenery Mode Enabled",
        message: "Telescope switched to scenery viewing mode",
      })
    } catch (error) {
      console.error('Error enabling scenery mode via WebSocket:', error)
      addStatusAlert({
        type: "error",
        title: "Scenery Mode Failed",
        message: `Failed to enable scenery mode: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  const handleTargetSelect = (target: CelestialObject) => {
    setSelectedTarget(target)

    addStatusAlert({
      type: "info",
      title: "Target Selected",
      message: `Selected ${target.name} for observation`,
    })
  }

  // Save observation to log
  const saveObservation = () => {
    if (!selectedTarget) return

    const newEntry: ObservationLogEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      target: selectedTarget,
      notes: observationNotes,
      rating: observationRating,
      sessionId: activeSession?.id,
      equipmentUsed: selectedEquipmentIds,
      settings: {
        exposure: exposure[0],
        gain: gain[0],
        brightness: brightness[0],
        contrast: contrast[0],
        focusPosition: focusPosition[0],
      },
      conditions: {
        weather: systemStats.weather.condition,
        seeing: systemStats.weather.seeingCondition,
        moonPhase: systemStats.moon.phase,
        moonIllumination: systemStats.moon.illumination,
        temperature: systemStats.temperature,
      },
    }

    setObservationLog((prev) => [newEntry, ...prev])
    setObservationNotes("")
    setObservationRating(3)

    // Update equipment usage statistics
    selectedEquipmentIds.forEach((equipmentId) => {
      setEquipment((prev) =>
        prev.map((eq) =>
          eq.id === equipmentId
            ? {
                ...eq,
                usage: {
                  ...eq.usage,
                  totalSessions: eq.usage.totalSessions + 1,
                  lastUsed: new Date(),
                },
                metadata: {
                  ...eq.metadata,
                  updatedAt: new Date(),
                },
              }
            : eq,
        ),
      )
    })

    addStatusAlert({
      type: "success",
      title: "Observation Saved",
      message: `Observation of ${selectedTarget.name} saved successfully`,
    })
  }

  // Delete observation from log
  const deleteObservation = (id: string) => {
    setObservationLog((prev) => prev.filter((entry) => entry.id !== id))

    addStatusAlert({
      type: "info",
      title: "Observation Deleted",
      message: "Observation removed from log",
    })
  }

  // Start a new observing session
  const startSession = () => {
    if (activeSession) return

    const newSession: Session = {
      id: `session-${Date.now()}`,
      startTime: new Date(),
      location: sessionLocation,
      equipment: sessionEquipment,
      equipmentUsed: selectedEquipmentIds,
      notes: sessionNotes,
      conditions: {
        weather: systemStats.weather.condition,
        seeing: systemStats.weather.seeingCondition,
        temperature: systemStats.temperature,
        humidity: systemStats.weather.humidity,
      },
    }

    setActiveSession(newSession)
    setSessionTimer(0)

    // Start the timer
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
    }
    sessionTimerRef.current = setInterval(() => {
      setSessionTimer((prev) => prev + 1)
    }, 1000)

    // Create a status alert
    addStatusAlert({
      type: "success",
      title: "Session Started",
      message: `New observation session started at ${new Date().toLocaleTimeString()}`,
    })
  }

  // Pause the current session
  const pauseSession = () => {
    if (!activeSession) return

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }

    addStatusAlert({
      type: "info",
      title: "Session Paused",
      message: `Session paused at ${formatSessionTime(sessionTimer)}`,
    })
  }

  // Resume the current session
  const resumeSession = () => {
    if (!activeSession) return

    if (!sessionTimerRef.current) {
      sessionTimerRef.current = setInterval(() => {
        setSessionTimer((prev) => prev + 1)
      }, 1000)
    }

    addStatusAlert({
      type: "info",
      title: "Session Resumed",
      message: `Session resumed at ${new Date().toLocaleTimeString()}`,
    })
  }

  // End the current session
  const endSession = () => {
    if (!activeSession) return

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current)
      sessionTimerRef.current = null
    }

    const endedSession: Session = {
      ...activeSession,
      endTime: new Date(),
      notes: sessionNotes,
      location: sessionLocation,
      equipment: sessionEquipment,
      equipmentUsed: selectedEquipmentIds,
    }

    setPastSessions((prev) => [endedSession, ...prev])
    setActiveSession(null)
    setSessionTimer(0)
    setSessionNotes("")
    setSessionLocation("")
    setSessionEquipment("")

    // Update equipment usage statistics
    selectedEquipmentIds.forEach((equipmentId) => {
      setEquipment((prev) =>
        prev.map((eq) =>
          eq.id === equipmentId
            ? {
                ...eq,
                usage: {
                  ...eq.usage,
                  totalSessions: eq.usage.totalSessions + 1,
                  totalHours: eq.usage.totalHours + sessionTimer / 3600,
                  lastUsed: new Date(),
                },
                metadata: {
                  ...eq.metadata,
                  updatedAt: new Date(),
                },
              }
            : eq,
        ),
      )
    })

    addStatusAlert({
      type: "success",
      title: "Session Ended",
      message: `Observation session completed with ${observationLog.filter((o) => o.sessionId === activeSession.id).length} observations`,
    })
  }

  // Format time for session duration display
  const formatSessionTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`
  }

  // Create a new planned session
  const createPlannedSession = () => {
    if (!newSessionTitle.trim()) return

    const forecast =
      weatherForecast.find((f) => f.date.toDateString() === selectedDate.toDateString()) || weatherForecast[0]

    const eventsOnDate = celestialEvents.filter(
      (event) => Math.abs(event.date.getTime() - selectedDate.getTime()) < 24 * 60 * 60 * 1000,
    )

    const newSession: PlannedSession = {
      id: `planned-${Date.now()}`,
      title: newSessionTitle,
      date: selectedDate,
      startTime: newSessionStartTime,
      endTime: newSessionEndTime,
      location: newSessionLocation,
      targets: [], // Could be populated based on recommendations
      celestialEvents: eventsOnDate,
      weatherForecast: forecast,
      notes: newSessionNotes,
      priority: newSessionPriority,
      status: "planned",
      reminders: true,
      plannedEquipment: selectedEquipmentIds,
    }

    setPlannedSessions((prev) => [...prev, newSession])

    // Reset form
    setNewSessionTitle("")
    setNewSessionStartTime("20:00")
    setNewSessionEndTime("23:00")
    setNewSessionLocation("")
    setNewSessionNotes("")
    setNewSessionPriority("medium")
    setPlanningView("calendar")

    addStatusAlert({
      type: "success",
      title: "Session Planned",
      message: `Observation session "${newSession.title}" scheduled for ${selectedDate.toLocaleDateString()}`,
    })
  }

  // Battery level monitoring
  useEffect(() => {
    if (systemStats.battery < 20) {
      toast.error("Low Battery", {
        description: `Telescope battery is at ${systemStats.battery}%. Please charge soon.`,
        duration: 5000,
      })
    }
  }, [systemStats.battery])

  // Update system stats from streaming status
  useEffect(() => {
    if (streamStatus?.status) {
      setSystemStats(prev => ({
        ...prev,
        battery: streamStatus.status.battery_capacity ?? prev.battery,
        temperature: streamStatus.status.temp ?? prev.temperature,
        freeMB: streamStatus.status.freeMB ?? prev.freeMB,
        totalMB: streamStatus.status.totalMB ?? prev.totalMB,
        diskUsage: streamStatus.status.freeMB && streamStatus.status.totalMB
          ? Math.round(((streamStatus.status.totalMB - streamStatus.status.freeMB) / streamStatus.status.totalMB) * 100)
          : prev.diskUsage
      }))
    }
  }, [streamStatus])

  // Initialize remote controllers on component mount
  useEffect(() => {
    fetchRemoteControllers()
  }, [])

  // Keyboard event handler
  const handleKeyDown = (event: KeyboardEvent) => {
    // Prevent shortcuts when typing in input fields
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return
    }

    // Prevent default for handled shortcuts
    const preventDefault = () => {
      event.preventDefault()
      event.stopPropagation()
    }

    switch (event.key.toLowerCase()) {
      // Telescope Movement
      case "arrowup":
        preventDefault()
        handleTelescopeMove("north")
        break
      case "arrowdown":
        preventDefault()
        handleTelescopeMove("south")
        break
      case "arrowleft":
        preventDefault()
        handleTelescopeMove("west")
        break
      case "arrowright":
        preventDefault()
        handleTelescopeMove("east")
        break
      case " ": // Space
        preventDefault()
        handleTelescopeMove("stop")
        break
      case "t":
        preventDefault()
        setIsTracking(!isTracking)
        break

      // Focus Control
      case "f":
        preventDefault()
        if (event.ctrlKey && event.shiftKey) {
          handleFocusAdjust("out") // Coarse out
        } else if (event.ctrlKey) {
          handleFocusAdjust("in") // Coarse in
        } else if (event.shiftKey) {
          handleFocusAdjust("out") // Fine out
        } else {
          handleFocusAdjust("in") // Fine in
        }
        break

      // Image Controls
      case "+":
      case "=":
        preventDefault()
        setExposure([Math.min(30, exposure[0] + 0.1)])
        break
      case "-":
        preventDefault()
        setExposure([Math.max(0.1, exposure[0] - 0.1)])
        break
      case "g":
        preventDefault()
        if (event.shiftKey) {
          setGain([Math.max(0, gain[0] - 5)])
        } else {
          setGain([Math.min(100, gain[0] + 5)])
        }
        break
      case "b":
        preventDefault()
        if (event.shiftKey) {
          setBrightness([Math.max(-50, brightness[0] - 5)])
        } else {
          setBrightness([Math.min(50, brightness[0] + 5)])
        }
        break
      case "c":
        preventDefault()
        if (event.shiftKey) {
          setContrast([Math.max(50, contrast[0] - 5)])
        } else {
          setContrast([Math.min(200, contrast[0] + 5)])
        }
        break

      // Interface Navigation
      case "/":
        preventDefault()
        // Focus search box (would need ref to search input)
        break
      case "l":
        preventDefault()
        setShowLogPanel(!showLogPanel)
        break
      case "s":
        if (!event.ctrlKey) {
          preventDefault()
          setShowStatsPanel(!showStatsPanel)
        }
        break
      case "p":
        if (!event.ctrlKey) {
          preventDefault()
          setShowPlanningPanel(!showPlanningPanel)
        }
        break
      case "?":
        preventDefault()
        setShowKeyboardHelp(!showKeyboardHelp)
        break
      case "f1":
        preventDefault()
        setShowDocumentation(!showDocumentation)
        break
      case "f10":
        preventDefault()
        setShowConfiguration(!showConfiguration)
        break
      case "escape":
        preventDefault()
        // Close any open modals
        if (showKeyboardHelp) setShowKeyboardHelp(false)
        else if (showDocumentation) setShowDocumentation(false)
        else if (showConfiguration) setShowConfiguration(false)
        else if (showPlanningPanel) setShowPlanningPanel(false)
        else if (showNotificationSettings) setShowNotificationSettings(false)
        else if (showNotificationHistory) setShowNotificationHistory(false)
        else if (showLocationManager) setShowLocationManager(false)
        else if (showDataManagementSettings) setShowDataManagementSettings(false)
        else if (showEquipmentManager) setShowEquipmentManager(false)
        else if (showPiP) setShowPiP(false)
        break

      // Session Management
      case "s":
        if (event.ctrlKey) {
          preventDefault()
          if (!activeSession) {
            startSession()
          }
        }
        break
      case "e":
        if (event.ctrlKey) {
          preventDefault()
          if (activeSession) {
            endSession()
          }
        }
        break
      case "o":
        if (event.ctrlKey) {
          preventDefault()
          if (selectedTarget) {
            saveObservation()
          }
        }
        break

      // Quick Rating
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
        if (selectedTarget) {
          preventDefault()
          setObservationRating(Number.parseInt(event.key))
        }
        break

      // Settings
      case ",":
        if (event.ctrlKey) {
          preventDefault()
          setShowNotificationSettings(!showNotificationSettings)
        }
        break
      case "d":
        if (event.ctrlKey) {
          preventDefault()
          setShowDataManagementSettings(!showDataManagementSettings)
        }
        break
      case "q":
        if (event.ctrlKey) {
          preventDefault()
          setShowEquipmentManager(!showEquipmentManager)
        }
        break
      // Picture-in-Picture
      case "i":
        if (event.ctrlKey) {
          preventDefault()
          setShowPiP(!showPiP)
        }
        break
      case "m":
        if (event.ctrlKey && showPiP) {
          preventDefault()
          setPipMinimized(!pipMinimized)
        }
        break
      case "a":
        if (event.ctrlKey) {
          preventDefault()
          setShowAnnotations(!showAnnotations)
        }
        break
      case "c":
        if (event.ctrlKey && event.shiftKey) {
          preventDefault()
          setShowChalkboard(!showChalkboard)
        }
        break
      case "k":
        if (event.ctrlKey || event.metaKey) {
          preventDefault()
          setShowCelestialSearch(true)
        }
        break
    }
  }

  const [showAnnotations, setShowAnnotations] = useState(false)
  const [currentAnnotations, setCurrentAnnotations] = useState<Annotation[]>([
    // Test annotations for development
    // {
    //   "type": "sh2",
    //   "pixelx": 923.287,
    //   "pixely": 1084.06,
    //   "radius": 15.5,
    //   "name": "",
    //   "names": [
    //     "SH2-162"
    //   ]
    // },
    // {
    //   "type": "ngc",
    //   "pixelx": 909.73,
    //   "pixely": 1063.47,
    //   "radius": 120.0,
    //   "name": "",
    //   "names": [
    //     "NGC 7635",
    //     "C 11 / Bubble Nebula"
    //   ]
    // },
    // {
    //   "type": "ngc",
    //   "pixelx": 107.54,
    //   "pixely": 581.549,
    //   "radius": 8.75,
    //   "name": "",
    //   "names": [
    //     "NGC 7654",
    //     "M 52"
    //   ]
    // }
  ])
  const [showStarmap, setShowStarmap] = useState(false)
  const [starmapSize, setStarmapSize] = useState<"small" | "medium" | "large" | "extra-large">("medium")
  const [starmapFullscreen, setStarmapFullscreen] = useState(false)
  const [starmapMinimized, setStarmapMinimized] = useState(false)
  const [showChalkboard, setShowChalkboard] = useState(false)
  const [starmapPosition, setStarmapPosition] = usePersistentState(STORAGE_KEYS.UI_STATE + "-starmap-position", { x: 20, y: 80 })
  const [annotationSettings, setAnnotationSettings] = useState<AnnotationSettings>({
    enabled: false,
    showLabels: false,
    showMagnitudes: false,
    showConstellations: false,
    minMagnitude: -3,
    maxMagnitude: 8,
    objectTypes: {
      stars: false,
      galaxies: false,
      nebulae: false,
      clusters: false,
      planets: false,
      moons: false,
      doubleStars: false,
      variableStars: false,
      asteroids: false,
      comets: false,
    },
    appearance: {
      circleColor: "#FFD700",
      labelColor: "#FFFFFF",
      circleOpacity: 0.8,
      labelOpacity: 0.9,
      circleThickness: 2,
      fontSize: 12,
      showConnectorLines: true,
    },
    behavior: {
      fadeOnHover: true,
      clickToSelect: true,
      autoHide: false,
      autoHideDelay: 5,
    },
  })

  // Plate Solve and Sync Functions
  const handlePlateSolve = async (apiKey?: string) => {
    if (!currentTelescope) {
      throw new Error("No telescope selected")
    }

    const response = await fetch(`/api/telescopes/${currentTelescope.id}/plate-solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `API request failed: ${response.status}`)
    }

    const result = await response.json()
    
    // The new async endpoint returns immediately with job_id
    // Results will come via WebSocket
    if (result.job_id) {
      addStatusAlert({
        type: "info",
        title: "Plate Solve Started",
        message: `Plate solving started (Job: ${result.job_id.slice(0, 8)}...). Results will be shown when complete.`,
      })
    }
    
    return result
  }

  const handleSyncTelescope = async (ra: number, dec: number) => {
    if (!currentTelescope) {
      throw new Error("No telescope selected")
    }

    const response = await fetch(`/api/telescopes/${currentTelescope.id}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ra, dec }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.detail || `API request failed: ${response.status}`)
    }

    return await response.json()
  }

  const value = {
    // Telescope Management
    telescopes,
    currentTelescope,
    isLoadingTelescopes,
    telescopeError,
    fetchTelescopes,
    selectTelescope,
    addManualTelescope,
    removeManualTelescope,
    showTelescopeManagement,
    setShowTelescopeManagement,

    // Remote Controller Management
    remoteControllers,
    isLoadingRemoteControllers,
    fetchRemoteControllers,
    addRemoteController,
    removeRemoteController,
    reconnectRemoteController,

    // State
    showOverlay,
    setShowOverlay,
    exposure,
    setExposure,
    gain,
    setGain,
    brightness,
    setBrightness,
    contrast,
    setContrast,
    connectionType,
    setConnectionType,
    focusPosition,
    setFocusPosition,
    isTracking,
    setIsTracking,
    imageStats,
    setImageStats,
    isControlsCollapsed,
    setIsControlsCollapsed,
    selectedTarget,
    setSelectedTarget,
    observationNotes,
    setObservationNotes,
    observationRating,
    setObservationRating,
    showLogPanel,
    setShowLogPanel,
    showStatsPanel,
    setShowStatsPanel,
    showKeyboardHelp,
    setShowKeyboardHelp,
    showDocumentation,
    setShowDocumentation,
    showConfiguration,
    setShowConfiguration,
    showPlanningPanel,
    setShowPlanningPanel,
    searchQuery,
    setSearchQuery,
    activeSession,
    setActiveSession,
    sessionNotes,
    setSessionNotes,
    sessionLocation,
    setSessionLocation,
    sessionEquipment,
    setSessionEquipment,
    sessionTimer,
    setSessionTimer,
    planningView,
    setPlanningView,
    selectedDate,
    setSelectedDate,
    newSessionTitle,
    setNewSessionTitle,
    newSessionStartTime,
    setNewSessionStartTime,
    newSessionEndTime,
    setNewSessionEndTime,
    newSessionLocation,
    setNewSessionLocation,
    newSessionNotes,
    setNewSessionNotes,
    newSessionPriority,
    setNewSessionPriority,
    plannedSessions,
    setPlannedSessions,
    sessionTimerRef,
    systemStats,
    setSystemStats,
    notificationPermission,
    setNotificationPermission,
    showNotificationSettings,
    setShowNotificationSettings,
    notificationSettings,
    setNotificationSettings,
    scheduledNotifications,
    setScheduledNotifications,
    notificationHistory,
    setNotificationHistory,
    showNotificationHistory,
    setShowNotificationHistory,
    showLocationManager,
    setShowLocationManager,
    observingLocations,
    setObservingLocations,
    currentObservingLocation,
    setCurrentObservingLocation,
    celestialObjects,
    setCelestialObjects,
    celestialEvents,
    setCelestialEvents,
    weatherForecast,
    setWeatherForecast,
    observationLog,
    setObservationLog,
    pastSessions,
    setPastSessions,
    showDataManagementSettings,
    setShowDataManagementSettings,
    showCelestialSearch,
    setShowCelestialSearch,
    showEquipmentManager,
    setShowEquipmentManager,
    equipment,
    setEquipment,
    maintenanceRecords,
    setMaintenanceRecords,
    equipmentSets,
    setEquipmentSets,
    selectedEquipmentIds,
    setSelectedEquipmentIds,
    tabActivity,
    setTabActivity,
    showPiP,
    setShowPiP,
    pipPosition,
    setPipPosition,
    pipSize,
    setPipSize,
    pipCamera,
    setPipCamera,
    pipMinimized,
    setPipMinimized,
    pipFullscreen,
    setPipFullscreen,
    liveViewFullscreen,
    setLiveViewFullscreen,
    pipOverlaySettings,
    setPipOverlaySettings,
    showPipOverlayControls,
    setShowPipOverlayControls,
    allskyUrls,
    setAllskyUrls,
    showPipStatus,
    setShowPipStatus,
    showStreamStatus,
    setShowStreamStatus,
    streamStatus,
    setStreamStatus,
    isImaging,
    setIsImaging,
    annotationSettings,
    setAnnotationSettings,
    showAnnotations,
    setShowAnnotations,
    currentAnnotations,
    setCurrentAnnotations,
    showStarmap,
    setShowStarmap,
    starmapSize,
    setStarmapSize,
    starmapFullscreen,
    setStarmapFullscreen,
    starmapMinimized,
    setStarmapMinimized,
    starmapPosition,
    setStarmapPosition,
    showChalkboard,
    setShowChalkboard,

    // Functions
    addStatusAlert,
    handleTelescopeMove,
    handleTelescopePark,
    handleFocusAdjust,
    handleGotoTarget,
    handleSceneryMode,
    handleTargetSelect,
    handlePlateSolve,
    handleSyncTelescope,
    saveObservation,
    deleteObservation,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    createPlannedSession,
    handleKeyDown,
  }

  return <TelescopeContext.Provider value={value}>{children}</TelescopeContext.Provider>
}

export function useTelescopeContext() {
  const context = useContext(TelescopeContext)
  if (context === undefined) {
    throw new Error("useTelescopeContext must be used within a TelescopeProvider")
  }
  return context
}
