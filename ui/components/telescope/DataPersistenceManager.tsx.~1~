"use client"

import { useEffect } from "react"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { STORAGE_KEYS, loadFromStorage, saveToStorage, isStorageAvailable } from "../../utils/storage-utils"
import type {
  ObservationLogEntry,
  Session,
  NotificationSettings,
  NotificationHistory,
  PlannedSession,
  PipOverlaySettings,
} from "../../types/telescope-types"
import type { ObservingLocation } from "../../location-management"

// Define UI state interface for persisting UI-related settings
interface UIState {
  isControlsCollapsed: boolean
  showOverlay: boolean
  exposure: number[]
  gain: number[]
  brightness: number[]
  contrast: number[]
  focusPosition: number[]
  isTracking: boolean
  showPiP: boolean
  pipPosition: { x: number; y: number }
  pipSize: "small" | "medium" | "large"
  pipCamera: "allsky" | "guide" | "finder"
  pipMinimized: boolean
  pipOverlaySettings: PipOverlaySettings
  allskyUrls: Record<string, string>
  showPipStatus: boolean
  showStreamStatus: boolean
  isImaging: boolean
}

export function DataPersistenceManager() {
  const {
    // State to persist
    observationLog,
    pastSessions,
    plannedSessions,
    notificationSettings,
    notificationHistory,
    observingLocations,
    currentObservingLocation,

    // UI state to persist
    isControlsCollapsed,
    showOverlay,
    exposure,
    gain,
    brightness,
    contrast,
    focusPosition,
    isTracking,
    showPiP,
    pipPosition,
    pipSize,
    pipCamera,
    pipMinimized,
    pipOverlaySettings,
    allskyUrls,
    showPipStatus,
    showStreamStatus,
    isImaging,

    // Setters
    setObservationLog,
    setPastSessions,
    setPlannedSessions,
    setNotificationSettings,
    setNotificationHistory,
    setObservingLocations,
    setCurrentObservingLocation,

    // UI setters
    setIsControlsCollapsed,
    setShowOverlay,
    setExposure,
    setGain,
    setBrightness,
    setContrast,
    setFocusPosition,
    setIsTracking,
    setShowPiP,
    setPipPosition,
    setPipSize,
    setPipCamera,
    setPipMinimized,
    setPipOverlaySettings,
    setAllskyUrls,
    setShowPipStatus,
    setShowStreamStatus,

    // Add status alert for notifications
    addStatusAlert,
  } = useTelescopeContext()

  // Check if localStorage is available
  const storageAvailable = isStorageAvailable()

  // Load data from localStorage on component mount
  useEffect(() => {
    if (!storageAvailable) {
      console.warn("localStorage is not available. Data will not persist between sessions.")
      return
    }

    // Load observation log
    const storedObservations = loadFromStorage<ObservationLogEntry[]>(STORAGE_KEYS.OBSERVATIONS, [])
    if (storedObservations.length > 0) {
      // Convert date strings back to Date objects
      const processedObservations = storedObservations.map((obs) => ({
        ...obs,
        timestamp: new Date(obs.timestamp),
      }))
      setObservationLog(processedObservations)
    }

    // Load past sessions
    const storedSessions = loadFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, [])
    if (storedSessions.length > 0) {
      // Convert date strings back to Date objects
      const processedSessions = storedSessions.map((session) => ({
        ...session,
        startTime: new Date(session.startTime),
        endTime: session.endTime ? new Date(session.endTime) : undefined,
      }))
      setPastSessions(processedSessions)
    }

    // Load planned sessions
    const storedPlannedSessions = loadFromStorage<PlannedSession[]>(STORAGE_KEYS.PLANNED_SESSIONS, [])
    if (storedPlannedSessions.length > 0) {
      // Convert date strings back to Date objects
      const processedPlannedSessions = storedPlannedSessions.map((session) => ({
        ...session,
        date: new Date(session.date),
        weatherForecast: {
          ...session.weatherForecast,
          date: new Date(session.weatherForecast.date),
        },
        celestialEvents: session.celestialEvents.map((event) => ({
          ...event,
          date: new Date(event.date),
        })),
      }))
      setPlannedSessions(processedPlannedSessions)
    }

    // Load notification settings
    const storedNotificationSettings = loadFromStorage<NotificationSettings>(
      STORAGE_KEYS.NOTIFICATION_SETTINGS,
      notificationSettings,
    )
    setNotificationSettings(storedNotificationSettings)

    // Load notification history
    const storedNotificationHistory = loadFromStorage<NotificationHistory[]>(STORAGE_KEYS.NOTIFICATION_HISTORY, [])
    if (storedNotificationHistory.length > 0) {
      // Convert date strings back to Date objects
      const processedHistory = storedNotificationHistory.map((notification) => ({
        ...notification,
        timestamp: new Date(notification.timestamp),
      }))
      setNotificationHistory(processedHistory)
    }

    // Load observing locations
    const storedLocations = loadFromStorage<ObservingLocation[]>(STORAGE_KEYS.LOCATIONS, [])
    if (storedLocations.length > 0) {
      // Convert date strings back to Date objects
      const processedLocations = storedLocations.map((location) => ({
        ...location,
        metadata: {
          ...location.metadata,
          createdAt: new Date(location.metadata.createdAt),
          lastUsed: location.metadata.lastUsed ? new Date(location.metadata.lastUsed) : undefined,
        },
      }))
      setObservingLocations(processedLocations)
    }

    // Load current location
    const storedCurrentLocation = loadFromStorage<ObservingLocation | null>(STORAGE_KEYS.CURRENT_LOCATION, null)
    if (storedCurrentLocation) {
      // Convert date strings back to Date objects
      const processedCurrentLocation = {
        ...storedCurrentLocation,
        metadata: {
          ...storedCurrentLocation.metadata,
          createdAt: new Date(storedCurrentLocation.metadata.createdAt),
          lastUsed: storedCurrentLocation.metadata.lastUsed
            ? new Date(storedCurrentLocation.metadata.lastUsed)
            : undefined,
        },
      }
      setCurrentObservingLocation(processedCurrentLocation)
    }

    // Load UI state
    const storedUIState = loadFromStorage<UIState>(STORAGE_KEYS.UI_STATE, {
      isControlsCollapsed,
      showOverlay,
      exposure,
      gain,
      brightness,
      contrast,
      focusPosition,
      isTracking,
      showPiP: false,
      pipPosition: { x: 20, y: 20 },
      pipSize: "medium",
      pipCamera: "allsky",
      pipMinimized: false,
      pipOverlaySettings: {
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
      },
      allskyUrls: {},
      showPipStatus: true,
      showStreamStatus: true,
      isImaging: false,
    })

    setIsControlsCollapsed(storedUIState.isControlsCollapsed)
    setShowOverlay(storedUIState.showOverlay)
    setExposure(storedUIState.exposure)
    setGain(storedUIState.gain)
    setBrightness(storedUIState.brightness)
    setContrast(storedUIState.contrast)
    setFocusPosition(storedUIState.focusPosition)
    setIsTracking(storedUIState.isTracking)
    if (storedUIState.showPiP !== undefined) setShowPiP(storedUIState.showPiP)
    if (storedUIState.pipPosition) setPipPosition(storedUIState.pipPosition)
    if (storedUIState.pipSize) setPipSize(storedUIState.pipSize)
    if (storedUIState.pipCamera) setPipCamera(storedUIState.pipCamera)
    if (storedUIState.pipMinimized !== undefined) setPipMinimized(storedUIState.pipMinimized)
    if (storedUIState.pipOverlaySettings) setPipOverlaySettings(storedUIState.pipOverlaySettings)
    if (storedUIState.allskyUrls) setAllskyUrls(storedUIState.allskyUrls)
    if (storedUIState.showPipStatus !== undefined) setShowPipStatus(storedUIState.showPipStatus)
    if (storedUIState.showStreamStatus !== undefined) setShowStreamStatus(storedUIState.showStreamStatus)
  }, []) // Empty dependency array ensures this only runs once on mount

  // Save observation log when it changes
  useEffect(() => {
    if (!storageAvailable) return
    saveToStorage(STORAGE_KEYS.OBSERVATIONS, observationLog)
  }, [observationLog, storageAvailable])

  // Save past sessions when they change
  useEffect(() => {
    if (!storageAvailable) return
    saveToStorage(STORAGE_KEYS.SESSIONS, pastSessions)
  }, [pastSessions, storageAvailable])

  // Save planned sessions when they change
  useEffect(() => {
    if (!storageAvailable) return
    saveToStorage(STORAGE_KEYS.PLANNED_SESSIONS, plannedSessions)
  }, [plannedSessions, storageAvailable])

  // Save notification settings when they change
  useEffect(() => {
    if (!storageAvailable) return
    saveToStorage(STORAGE_KEYS.NOTIFICATION_SETTINGS, notificationSettings)
  }, [notificationSettings, storageAvailable])

  // Save notification history when it changes
  useEffect(() => {
    if (!storageAvailable) return
    saveToStorage(STORAGE_KEYS.NOTIFICATION_HISTORY, notificationHistory)
  }, [notificationHistory, storageAvailable])

  // Save observing locations when they change
  useEffect(() => {
    if (!storageAvailable) return
    saveToStorage(STORAGE_KEYS.LOCATIONS, observingLocations)
  }, [observingLocations, storageAvailable])

  // Save current location when it changes
  useEffect(() => {
    if (!storageAvailable) return
    saveToStorage(STORAGE_KEYS.CURRENT_LOCATION, currentObservingLocation)
  }, [currentObservingLocation, storageAvailable])

  // Save UI state when it changes
  useEffect(() => {
    if (!storageAvailable) return

    const uiState: UIState = {
      isControlsCollapsed,
      showOverlay,
      exposure,
      gain,
      brightness,
      contrast,
      focusPosition,
      isTracking,
      showPiP,
      pipPosition,
      pipSize,
      pipCamera,
      pipMinimized,
      pipOverlaySettings,
      allskyUrls,
      showPipStatus,
      showStreamStatus,
      isImaging,
    }

    saveToStorage(STORAGE_KEYS.UI_STATE, uiState)
  }, [
    isControlsCollapsed,
    showOverlay,
    exposure,
    gain,
    brightness,
    contrast,
    focusPosition,
    isTracking,
    showPiP,
    pipPosition,
    pipSize,
    pipCamera,
    pipMinimized,
    pipOverlaySettings,
    allskyUrls,
    showPipStatus,
    showStreamStatus,
    isImaging,
    storageAvailable,
  ])

  // This component doesn't render anything
  return null
}
