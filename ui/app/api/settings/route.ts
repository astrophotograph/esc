import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, mkdir } from 'fs/promises'
import path from 'path'
import { AppSettings, SettingsApiResponse, SettingsValidationError } from '@/types/settings-types'

const SETTINGS_DIR = path.join(process.cwd(), 'data', 'settings')
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'app-settings.json')

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  pip: {
    defaultSize: "medium",
    defaultCamera: "allsky",
    position: { x: 20, y: 20 },
    showStatusByDefault: true,
    overlaySettings: {
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
        showCoordinates: true,
        unit: "arcmin",
      },
      compass: {
        enabled: false,
        color: "#00ffff",
        showCardinals: true,
        showDegrees: false,
      },
    },
    autoShow: false,
    minimizedByDefault: false,
  },
  subframeSaving: {
    enabled: false,
    directory: "./captures",
    fileFormat: "jpg",
    quality: 90,
    compression: 6,
    saveMetadata: true,
    filenamePattern: "capture_%Y%m%d_%H%M%S",
    autoSave: false,
    saveInterval: 30,
    maxFiles: 1000,
  },
  camera: {
    defaultExposure: 1.0,
    defaultGain: 50,
    defaultBrightness: 0,
    defaultContrast: 100,
    autoExposure: false,
    videoQuality: "high",
    preferredConnection: "auto",
    frameRate: 30,
  },
  telescope: {
    defaultMoveSpeed: 2,
    gotoTimeout: 120,
    trackingEnabled: true,
    parkOnDisconnect: false,
    coordinateFormat: "hours",
    slewRateLimit: 8,
    focusStepSize: 10,
  },
  ui: {
    theme: "dark",
    compactMode: false,
    showTooltips: true,
    animationsEnabled: true,
    defaultPanelLayout: "expanded",
    showStatusAlerts: true,
    alertTimeout: 5,
    language: "en",
  },
  session: {
    autoStartSession: false,
    defaultLocation: "",
    defaultEquipmentSet: "",
    autoSaveInterval: 5,
    backupRetentionDays: 30,
    exportFormat: "json",
    includeImages: false,
  },
  notifications: {
    enableBrowserNotifications: true,
    enableSounds: true,
    alertTypes: {
      connectionLost: true,
      gotoComplete: true,
      lowBattery: true,
      weatherAlerts: true,
      maintenanceReminders: true,
    },
    soundVolume: 50,
    quietHours: {
      enabled: false,
      startTime: "22:00",
      endTime: "06:00",
    },
  },
  version: "1.0.0",
  lastModified: new Date().toISOString(),
}

// Validation functions
function validateSettings(settings: Partial<AppSettings>): SettingsValidationError[] {
  const errors: SettingsValidationError[] = []

  // Validate subframe saving
  if (settings.subframeSaving) {
    const { directory, quality, compression, saveInterval, maxFiles } = settings.subframeSaving
    
    if (!directory || directory.trim() === '') {
      errors.push({ field: 'subframeSaving.directory', message: 'Directory path is required' })
    }
    
    if (quality !== undefined && (quality < 1 || quality > 100)) {
      errors.push({ field: 'subframeSaving.quality', message: 'Quality must be between 1 and 100' })
    }
    
    if (compression !== undefined && (compression < 0 || compression > 9)) {
      errors.push({ field: 'subframeSaving.compression', message: 'Compression must be between 0 and 9' })
    }
    
    if (saveInterval !== undefined && saveInterval < 1) {
      errors.push({ field: 'subframeSaving.saveInterval', message: 'Save interval must be at least 1 second' })
    }
    
    if (maxFiles !== undefined && maxFiles < 0) {
      errors.push({ field: 'subframeSaving.maxFiles', message: 'Max files cannot be negative' })
    }
  }

  // Validate camera settings
  if (settings.camera) {
    const { defaultExposure, defaultGain, frameRate } = settings.camera
    
    if (defaultExposure !== undefined && (defaultExposure < 0.1 || defaultExposure > 10)) {
      errors.push({ field: 'camera.defaultExposure', message: 'Exposure must be between 0.1 and 10 seconds' })
    }
    
    if (defaultGain !== undefined && (defaultGain < 0 || defaultGain > 100)) {
      errors.push({ field: 'camera.defaultGain', message: 'Gain must be between 0 and 100' })
    }
    
    if (frameRate !== undefined && (frameRate < 1 || frameRate > 60)) {
      errors.push({ field: 'camera.frameRate', message: 'Frame rate must be between 1 and 60 FPS' })
    }
  }

  // Validate telescope settings
  if (settings.telescope) {
    const { gotoTimeout, slewRateLimit, focusStepSize } = settings.telescope
    
    if (gotoTimeout !== undefined && gotoTimeout < 10) {
      errors.push({ field: 'telescope.gotoTimeout', message: 'GoTo timeout must be at least 10 seconds' })
    }
    
    if (slewRateLimit !== undefined && ![1, 2, 4, 8].includes(slewRateLimit)) {
      errors.push({ field: 'telescope.slewRateLimit', message: 'Slew rate limit must be 1, 2, 4, or 8' })
    }
    
    if (focusStepSize !== undefined && (focusStepSize < 1 || focusStepSize > 1000)) {
      errors.push({ field: 'telescope.focusStepSize', message: 'Focus step size must be between 1 and 1000' })
    }
  }

  return errors
}

// Ensure settings directory exists
async function ensureSettingsDir() {
  try {
    await mkdir(SETTINGS_DIR, { recursive: true })
  } catch (error) {
    console.error('Failed to create settings directory:', error)
  }
}

// Load settings from file
async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await readFile(SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(data) as AppSettings
    
    // Merge with defaults to ensure all fields are present
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      pip: { ...DEFAULT_SETTINGS.pip, ...settings.pip },
      subframeSaving: { ...DEFAULT_SETTINGS.subframeSaving, ...settings.subframeSaving },
      camera: { ...DEFAULT_SETTINGS.camera, ...settings.camera },
      telescope: { ...DEFAULT_SETTINGS.telescope, ...settings.telescope },
      ui: { ...DEFAULT_SETTINGS.ui, ...settings.ui },
      session: { ...DEFAULT_SETTINGS.session, ...settings.session },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...settings.notifications },
    }
  } catch (error) {
    console.log('Settings file not found, using defaults')
    return DEFAULT_SETTINGS
  }
}

// Save settings to file
async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureSettingsDir()
  settings.lastModified = new Date().toISOString()
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
}

export async function GET(): Promise<NextResponse<SettingsApiResponse>> {
  try {
    const settings = await loadSettings()
    
    return NextResponse.json({
      success: true,
      settings,
    })
  } catch (error) {
    console.error('Error loading settings:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load settings',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<SettingsApiResponse>> {
  try {
    const body = await request.json()
    const newSettings = body as Partial<AppSettings>
    
    // Validate the settings
    const validationErrors = validateSettings(newSettings)
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          validationErrors,
        },
        { status: 400 }
      )
    }
    
    // Load current settings and merge
    const currentSettings = await loadSettings()
    const mergedSettings: AppSettings = {
      ...currentSettings,
      ...newSettings,
      pip: { ...currentSettings.pip, ...newSettings.pip },
      subframeSaving: { ...currentSettings.subframeSaving, ...newSettings.subframeSaving },
      camera: { ...currentSettings.camera, ...newSettings.camera },
      telescope: { ...currentSettings.telescope, ...newSettings.telescope },
      ui: { ...currentSettings.ui, ...newSettings.ui },
      session: { ...currentSettings.session, ...newSettings.session },
      notifications: { ...currentSettings.notifications, ...newSettings.notifications },
    }
    
    // Save the merged settings
    await saveSettings(mergedSettings)
    
    return NextResponse.json({
      success: true,
      settings: mergedSettings,
    })
  } catch (error) {
    console.error('Error saving settings:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save settings',
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse<SettingsApiResponse>> {
  try {
    const body = await request.json()
    const settings = body as AppSettings
    
    // Validate the complete settings object
    const validationErrors = validateSettings(settings)
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          validationErrors,
        },
        { status: 400 }
      )
    }
    
    // Save the complete settings
    await saveSettings(settings)
    
    return NextResponse.json({
      success: true,
      settings,
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update settings',
      },
      { status: 500 }
    )
  }
}

// Reset to defaults
export async function DELETE(): Promise<NextResponse<SettingsApiResponse>> {
  try {
    await saveSettings(DEFAULT_SETTINGS)
    
    return NextResponse.json({
      success: true,
      settings: DEFAULT_SETTINGS,
    })
  } catch (error) {
    console.error('Error resetting settings:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to reset settings',
      },
      { status: 500 }
    )
  }
}