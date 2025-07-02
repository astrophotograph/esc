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

    try {
      // Load observation log
      const storedObservations = loadFromStorage<ObservationLogEntry[]>(STORAGE_KEYS.OBSERVATIONS, [])
      if (storedObservations && storedObservations.length > 0) {
        // Convert date strings back to Date objects
        const processedObservations = storedObservations.map((obs) => ({
          ...obs,
          timestamp: new Date(obs.timestamp),
        }))
        setObservationLog(processedObservations)
      }
    } catch (error) {
      console.error('Failed to load observation log:', error)
      addStatusAlert?.({
        type: 'error',
        message: 'Failed to load observation data',
        duration: 5000,
      })
    }

    try {
      // Load past sessions
      const storedSessions = loadFromStorage<Session[]>(STORAGE_KEYS.SESSIONS, [])
      if (storedSessions && storedSessions.length > 0) {
        // Convert date strings back to Date objects
        const processedSessions = storedSessions.map((session) => ({
          ...session,
          startTime: new Date(session.startTime),
          endTime: session.endTime ? new Date(session.endTime) : undefined,
        }))
        setPastSessions(processedSessions)
      }
    } catch (error) {
      console.error('Failed to load past sessions:', error)
    }

    try {
      // Load planned sessions
      const storedPlannedSessions = loadFromStorage<PlannedSession[]>(STORAGE_KEYS.PLANNED_SESSIONS, [])
      if (storedPlannedSessions && storedPlannedSessions.length > 0) {
        // Convert date strings back to Date objects
        const processedPlannedSessions = storedPlannedSessions.map((session) => ({
          ...session,
          date: new Date(session.date),
          weatherForecast: session.weatherForecast ? {
            ...session.weatherForecast,
            date: session.weatherForecast.date ? new Date(session.weatherForecast.date) : new Date(),
          } : undefined,
          celestialEvents: session.celestialEvents ? session.celestialEvents.map((event) => ({
            ...event,
            date: new Date(event.date),
          })) : [],
        }))
        setPlannedSessions(processedPlannedSessions)
      }
    } catch (error) {
      console.error('Failed to load planned sessions:', error)
    }

    try {
      // Load notification settings
      const storedNotificationSettings = loadFromStorage<NotificationSettings>(
        STORAGE_KEYS.NOTIFICATION_SETTINGS,
        notificationSettings,
      )
      if (storedNotificationSettings) {
        setNotificationSettings(storedNotificationSettings)
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error)
    }

    try {
      // Load notification history
      const storedNotificationHistory = loadFromStorage<NotificationHistory[]>(STORAGE_KEYS.NOTIFICATION_HISTORY, [])
      if (storedNotificationHistory && storedNotificationHistory.length > 0) {
        // Convert date strings back to Date objects
        const processedHistory = storedNotificationHistory.map((notification) => ({
          ...notification,
          timestamp: new Date(notification.timestamp),
        }))
        setNotificationHistory(processedHistory)
      }
    } catch (error) {
      console.error('Failed to load notification history:', error)
    }

    try {
      // Load observing locations
      const storedLocations = loadFromStorage<ObservingLocation[]>(STORAGE_KEYS.LOCATIONS, [])
      if (storedLocations && storedLocations.length > 0) {
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
    } catch (error) {
      console.error('Failed to load observing locations:', error)
    }

    try {
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
    } catch (error) {
      console.error('Failed to load current location:', error)
    }

    try {
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

      if (storedUIState) {
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
      }
    } catch (error) {
      console.error('Failed to load UI state:', error)
    }
  }, []) // Empty dependency array ensures this only runs once on mount

  // Save observation log when it changes
  useEffect(() => {
    if (!storageAvailable) return
    try {
      saveToStorage(STORAGE_KEYS.OBSERVATIONS, observationLog)
    } catch (error) {
      console.error('Failed to save observation log:', error)
    }
  }, [observationLog, storageAvailable])

  // Save past sessions when they change
  useEffect(() => {
    if (!storageAvailable) return
    try {
      saveToStorage(STORAGE_KEYS.SESSIONS, pastSessions)
    } catch (error) {
      console.error('Failed to save past sessions:', error)
    }
  }, [pastSessions, storageAvailable])

  // Save planned sessions when they change
  useEffect(() => {
    if (!storageAvailable) return
    try {
      saveToStorage(STORAGE_KEYS.PLANNED_SESSIONS, plannedSessions)
    } catch (error) {
      console.error('Failed to save planned sessions:', error)
    }
  }, [plannedSessions, storageAvailable])

  // Save notification settings when they change
  useEffect(() => {
    if (!storageAvailable) return
    try {
      saveToStorage(STORAGE_KEYS.NOTIFICATION_SETTINGS, notificationSettings)
    } catch (error) {
      console.error('Failed to save notification settings:', error)
    }
  }, [notificationSettings, storageAvailable])

  // Save notification history when it changes
  useEffect(() => {
    if (!storageAvailable) return
    try {
      saveToStorage(STORAGE_KEYS.NOTIFICATION_HISTORY, notificationHistory)
    } catch (error) {
      console.error('Failed to save notification history:', error)
    }
  }, [notificationHistory, storageAvailable])

  // Save observing locations when they change
  useEffect(() => {
    if (!storageAvailable) return
    try {
      saveToStorage(STORAGE_KEYS.LOCATIONS, observingLocations)
    } catch (error) {
      console.error('Failed to save observing locations:', error)
    }
  }, [observingLocations, storageAvailable])

  // Save current location when it changes
  useEffect(() => {
    if (!storageAvailable) return
    try {
      saveToStorage(STORAGE_KEYS.CURRENT_LOCATION, currentObservingLocation)
    } catch (error) {
      console.error('Failed to save current location:', error)
    }
  }, [currentObservingLocation, storageAvailable])

  // Save UI state when it changes
  useEffect(() => {
    if (!storageAvailable) return

    try {
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
    } catch (error) {
      console.error('Failed to save UI state:', error)
    }
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
