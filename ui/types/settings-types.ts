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

export interface PipSettings {
  defaultSize: "small" | "medium" | "large" | "extra-large"
  defaultCamera: "allsky" | "guide" | "finder"
  position: { x: number; y: number }
  showStatusByDefault: boolean
  overlaySettings: PipOverlaySettings
  autoShow: boolean
  minimizedByDefault: boolean
}

export interface SubframeSavingSettings {
  enabled: boolean
  directory: string
  fileFormat: "jpg" | "png" | "tiff" | "raw"
  quality: number // For JPEG
  compression: number // For PNG/TIFF
  saveMetadata: boolean
  filenamePattern: string
  autoSave: boolean
  saveInterval: number // seconds
  maxFiles: number // 0 = unlimited
}

export interface CameraSettings {
  defaultExposure: number
  defaultGain: number
  defaultBrightness: number
  defaultContrast: number
  autoExposure: boolean
  videoQuality: "low" | "medium" | "high" | "ultra"
  preferredConnection: "webrtc" | "mjpeg" | "auto"
  frameRate: number
}

export interface TelescopeSettings {
  defaultMoveSpeed: 1 | 2 | 4 | 8
  gotoTimeout: number // seconds
  trackingEnabled: boolean
  parkOnDisconnect: boolean
  coordinateFormat: "degrees" | "hours"
  slewRateLimit: number
  focusStepSize: number
}

export interface UISettings {
  theme: "dark" | "light" | "auto"
  compactMode: boolean
  showTooltips: boolean
  animationsEnabled: boolean
  defaultPanelLayout: "collapsed" | "expanded"
  showStatusAlerts: boolean
  alertTimeout: number // seconds
  language: string
}

export interface SessionSettings {
  autoStartSession: boolean
  defaultLocation: string
  defaultEquipmentSet: string
  autoSaveInterval: number // minutes
  backupRetentionDays: number
  exportFormat: "json" | "csv" | "pdf"
  includeImages: boolean
}

export interface NotificationSettings {
  enableBrowserNotifications: boolean
  enableSounds: boolean
  alertTypes: {
    connectionLost: boolean
    gotoComplete: boolean
    lowBattery: boolean
    weatherAlerts: boolean
    maintenanceReminders: boolean
  }
  soundVolume: number
  quietHours: {
    enabled: boolean
    startTime: string
    endTime: string
  }
}

export interface AppSettings {
  pip: PipSettings
  subframeSaving: SubframeSavingSettings
  camera: CameraSettings
  telescope: TelescopeSettings
  ui: UISettings
  session: SessionSettings
  notifications: NotificationSettings
  version: string
  lastModified: string
}

export interface SettingsValidationError {
  field: string
  message: string
}

export interface SettingsApiResponse {
  success: boolean
  settings?: AppSettings
  error?: string
  validationErrors?: SettingsValidationError[]
}