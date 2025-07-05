// Define telescope info interface
export interface TelescopeInfo {
  name: string
  host: string
  port: number
  connected: boolean
  serial_number: string
  product_model: string
  ssid: string
  is_remote?: boolean
  discovery_method: string // "manual" or "auto_discovery"
  // Computed properties for UI compatibility
  id: string
  status: "online" | "offline" | "maintenance" | "error"
  type?: string
  location?: string
  description?: string
  isConnected?: boolean
  // Computed property derived from discovery_method
  isManual?: boolean
}

// Define celestial object types
export type CelestialObjectType = "galaxy" | "nebula" | "cluster" | "planet" | "moon" | "double-star"

// Define celestial object interface
export interface CelestialObject {
  id: string
  name: string
  type: CelestialObjectType
  magnitude: number
  ra: string // Right Ascension
  dec: string // Declination
  bestSeenIn: string // Season or month
  description: string
  optimalMoonPhase: "new" | "crescent" | "quarter" | "gibbous" | "full" | "any"
  isCurrentlyVisible: boolean
}

// Define observation log entry interface
export interface ObservationLogEntry {
  id: string
  timestamp: Date
  target: CelestialObject
  notes: string
  rating: number // 1-5 stars
  sessionId?: string
  equipmentUsed?: string[] // Equipment IDs used in this observation
  settings: {
    exposure: number
    gain: number
    brightness: number
    contrast: number
    focusPosition: number
  }
  conditions: {
    weather: string
    seeing: string
    moonPhase: string
    moonIllumination: number
    temperature: number
  }
}

// Define session interface
export interface Session {
  id: string
  startTime: Date
  endTime?: Date
  location?: string
  equipment?: string
  equipmentUsed?: string[] // Equipment IDs used in this session
  notes?: string
  conditions: {
    weather: string
    seeing: string
    temperature: number
    humidity: number
  }
}

// Define alert interface
export interface StatusAlert {
  id: string
  type: "info" | "warning" | "error" | "success"
  title: string
  message: string
  timestamp: Date
  dismissed: boolean
}

// Define keyboard shortcut interface
export interface KeyboardShortcut {
  key: string
  description: string
  action: () => void
}

// Define celestial event interface
export interface CelestialEvent {
  id: string
  name: string
  type: "moon_phase" | "planet_opposition" | "meteor_shower" | "eclipse" | "conjunction" | "transit"
  date: Date
  description: string
  visibility: "excellent" | "good" | "fair" | "poor"
  bestViewingTime: string
  duration?: string
  magnitude?: number
  constellation?: string
}

// Define weather forecast interface
export interface WeatherForecast {
  date: Date
  condition: "clear" | "partly_cloudy" | "cloudy" | "overcast" | "rain" | "snow"
  cloudCover: number // 0-100%
  temperature: {
    high: number
    low: number
  }
  humidity: number
  windSpeed: number
  seeingForecast: "excellent" | "good" | "fair" | "poor"
  observingScore: number // 0-100, higher is better
}

// Define planned session interface
export interface PlannedSession {
  id: string
  title: string
  date: Date
  startTime: string
  endTime: string
  location: string
  targets: CelestialObject[]
  celestialEvents: CelestialEvent[]
  weatherForecast: WeatherForecast
  notes: string
  priority: "high" | "medium" | "low"
  status: "planned" | "confirmed" | "cancelled" | "completed"
  reminders: boolean
  plannedEquipment?: string[] // Equipment IDs planned for this session
}

// Define notification interfaces
export interface NotificationSettings {
  enabled: boolean
  sessionReminders: {
    enabled: boolean
    advanceTime: number // minutes before session
  }
  weatherAlerts: {
    enabled: boolean
    goodConditions: boolean
    badConditions: boolean
    threshold: number // observing score threshold
  }
  celestialEvents: {
    enabled: boolean
    advanceTime: number // hours before event
    eventTypes: CelestialEvent["type"][]
  }
  systemAlerts: {
    enabled: boolean
    batteryLow: boolean
    storageHigh: boolean
    equipmentIssues: boolean
  }
  quietHours: {
    enabled: boolean
    startTime: string
    endTime: string
  }
}

export interface ScheduledNotification {
  id: string
  type: "session" | "weather" | "event" | "system"
  title: string
  message: string
  scheduledTime: Date
  data?: any
  sent: boolean
}

export interface NotificationHistory {
  id: string
  type: "session" | "weather" | "event" | "system"
  title: string
  message: string
  timestamp: Date
  clicked: boolean
  dismissed: boolean
}

export interface SystemStats {
  battery: number
  temperature: number
  diskUsage: number
  freeMB?: number
  totalMB?: number
  weather: {
    condition: string
    humidity: number
    windSpeed: number
    seeingCondition: string
    seeingValue: number // arcseconds
  }
  moon: {
    phase: string
    illumination: number
    age: number // days since new moon
    rise: string
    set: string
    isVisible: boolean
  }
}

export interface ImageStats {
  mean: number
  std: number
  min: number
  max: number
  histogram: number[]
}

// Equipment Management Types
export type EquipmentType =
  | "telescope"
  | "mount"
  | "camera"
  | "eyepiece"
  | "filter"
  | "focuser"
  | "guide_scope"
  | "guide_camera"
  | "accessory"

export type EquipmentCondition = "excellent" | "good" | "fair" | "poor" | "needs_repair"

export type MaintenanceType = "cleaning" | "collimation" | "calibration" | "repair" | "upgrade" | "inspection"

export interface Equipment {
  id: string
  name: string
  type: EquipmentType
  brand: string
  model: string
  serialNumber?: string
  purchaseDate?: Date
  purchasePrice?: number
  condition: EquipmentCondition
  description?: string
  specifications: Record<string, any> // Flexible specs based on equipment type
  compatibility: {
    telescopes?: string[] // Compatible telescope IDs
    mounts?: string[] // Compatible mount IDs
    cameras?: string[] // Compatible camera IDs
    accessories?: string[] // Compatible accessory IDs
  }
  location: {
    storage: string // Where it's stored
    isPortable: boolean
    weight?: number // in kg
  }
  usage: {
    totalSessions: number
    totalHours: number
    lastUsed?: Date
    averageRating: number
  }
  maintenance: {
    lastMaintenance?: Date
    nextMaintenance?: Date
    maintenanceInterval?: number // days
    maintenanceNotes?: string
  }
  settings: {
    isFavorite: boolean
    isActive: boolean // Currently in use
    defaultSettings?: Record<string, any>
    notes?: string
  }
  metadata: {
    createdAt: Date
    updatedAt: Date
    imageUrl?: string
    manualUrl?: string
    warrantyExpiry?: Date
  }
}

export interface MaintenanceRecord {
  id: string
  equipmentId: string
  type: MaintenanceType
  date: Date
  description: string
  cost?: number
  performedBy: string
  nextDueDate?: Date
  notes?: string
  beforeCondition: EquipmentCondition
  afterCondition: EquipmentCondition
  attachments?: string[] // URLs to photos/documents
}

export interface EquipmentSet {
  id: string
  name: string
  description: string
  equipmentIds: string[]
  purpose: string // e.g., "Deep Sky Imaging", "Planetary", "Visual"
  isDefault: boolean
  createdAt: Date
  lastUsed?: Date
  timesUsed: number
}

export interface CompatibilityCheck {
  isCompatible: boolean
  warnings: string[]
  suggestions: string[]
  missingEquipment: string[]
}

export interface PipOverlaySettings {
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

export interface PipOverlaySettings {
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

// Annotation Types
export type AnnotationType =
  | "star"
  | "galaxy"
  | "nebula"
  | "cluster"
  | "planet"
  | "moon"
  | "double-star"
  | "variable-star"
  | "asteroid"
  | "comet"

export interface ScreenAnnotation {
  id: string
  name: string
  type: AnnotationType
  x: number // Screen X coordinate (0-100%)
  y: number // Screen Y coordinate (0-100%)
  magnitude?: number
  constellation?: string
  description: string
  catalogId?: string // Messier, NGC, etc.
  isVisible: boolean
  confidence: number // 0-1, how confident the detection is
  metadata?: {
    spectralClass?: string
    distance?: string
    size?: string
    discoverer?: string
    discoveryDate?: string
  }
}

export interface AnnotationSettings {
  enabled: boolean
  showLabels: boolean
  showMagnitudes: boolean
  showConstellations: boolean
  minMagnitude: number // Only show objects brighter than this
  maxMagnitude: number // Only show objects dimmer than this
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
    autoHideDelay: number // seconds
  }
}
