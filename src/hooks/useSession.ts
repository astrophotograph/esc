import { useCallback } from 'react'
import { invoke, runtime } from '../services/api'
import { useSessionStore, ObservationSession, TonightTarget, VisibilityInfo } from '../stores'

// API response types
interface SessionResult {
  id: string
  telescope_id?: string
  name: string
  started_at: string
  ended_at?: string
  location_lat?: number
  location_lon?: number
  notes?: string
}

interface VisibilityResult {
  target_name: string
  is_visible: boolean
  altitude: number
  azimuth: number
  rise_time?: string
  set_time?: string
  transit_time?: string
  transit_altitude?: number
  best_time?: string
  hours_visible?: number
}

interface TonightTargetsResult {
  targets: Array<{
    id: string
    name: string
    object_type: string
    magnitude?: number
    altitude: number
    azimuth: number
    constellation?: string
  }>
}

/**
 * Hook for session and planning operations
 */
export function useSession() {
  const {
    setSessions,
    addSession,
    updateSession,
    deleteSession,
    setCurrentSession,
    setTonightTargets,
    setIsLoadingTargets,
    setLocation,
    sessions,
    currentSession,
    observationLogs,
    tonightTargets,
    location,
    isLoadingTargets,
  } = useSessionStore()

  /**
   * Create a new observation session
   */
  const createSession = useCallback(async (
    name: string,
    options?: {
      telescopeId?: string
      locationLat?: number
      locationLon?: number
      notes?: string
    }
  ) => {
    try {
      const resultJson = await invoke<string>('planning_create_session', {
        params: {
          name,
          telescope_id: options?.telescopeId,
          location_lat: options?.locationLat ?? location?.latitude,
          location_lon: options?.locationLon ?? location?.longitude,
          notes: options?.notes,
        }
      })

      const result: SessionResult = JSON.parse(resultJson)

      const session: ObservationSession = {
        id: result.id,
        name: result.name,
        telescopeId: result.telescope_id,
        startedAt: result.started_at,
        endedAt: result.ended_at,
        locationLat: result.location_lat,
        locationLon: result.location_lon,
        notes: result.notes,
      }

      addSession(session)
      return session
    } catch (error) {
      console.error('Failed to create session:', error)
      throw error
    }
  }, [location, addSession])

  /**
   * Get all sessions
   */
  const getSessions = useCallback(async () => {
    try {
      const resultJson = await invoke<string>('planning_get_sessions')
      const results: SessionResult[] = JSON.parse(resultJson)

      const sessions: ObservationSession[] = results.map(r => ({
        id: r.id,
        name: r.name,
        telescopeId: r.telescope_id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        locationLat: r.location_lat,
        locationLon: r.location_lon,
        notes: r.notes,
      }))

      setSessions(sessions)
      return sessions
    } catch (error) {
      console.error('Failed to get sessions:', error)
      return []
    }
  }, [setSessions])

  /**
   * End a session
   */
  const endSession = useCallback(async (sessionId: string, notes?: string) => {
    try {
      const resultJson = await invoke<string>('planning_end_session', {
        sessionId,
        notes,
      })

      const result: SessionResult = JSON.parse(resultJson)

      updateSession(sessionId, {
        endedAt: result.ended_at,
        notes: result.notes,
      })

      if (currentSession?.id === sessionId) {
        setCurrentSession(null)
      }

      return true
    } catch (error) {
      console.error('Failed to end session:', error)
      throw error
    }
  }, [currentSession, updateSession, setCurrentSession])

  /**
   * Delete a session
   */
  const removeSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('planning_delete_session', { sessionId })
      deleteSession(sessionId)
      return true
    } catch (error) {
      console.error('Failed to delete session:', error)
      throw error
    }
  }, [deleteSession])

  /**
   * Get visibility for a target
   */
  const getTargetVisibility = useCallback(async (
    targetName: string,
    ra: number,
    dec: number,
    options?: {
      date?: string
      minAltitude?: number
    }
  ): Promise<VisibilityInfo> => {
    if (!location) {
      throw new Error('Location not set')
    }

    try {
      const resultJson = await invoke<string>('planning_get_visibility', {
        target: { name: targetName, ra, dec },
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          elevation: location.elevation,
        },
        date: options?.date,
        minAltitude: options?.minAltitude,
      })

      const result: VisibilityResult = JSON.parse(resultJson)

      return {
        targetName: result.target_name,
        isVisible: result.is_visible,
        altitude: result.altitude,
        azimuth: result.azimuth,
        riseTime: result.rise_time,
        setTime: result.set_time,
        transitTime: result.transit_time,
        transitAltitude: result.transit_altitude,
        bestTime: result.best_time,
        hoursVisible: result.hours_visible,
      }
    } catch (error) {
      console.error('Failed to get visibility:', error)
      throw error
    }
  }, [location])

  /**
   * Get tonight's recommended targets
   */
  const getTonightTargets = useCallback(async (options?: {
    limit?: number
    minAltitude?: number
  }) => {
    if (!location) {
      throw new Error('Location not set')
    }

    setIsLoadingTargets(true)

    try {
      const resultJson = await invoke<string>('planning_get_tonight_targets', {
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          elevation: location.elevation,
        },
        limit: options?.limit ?? 20,
        minAltitude: options?.minAltitude ?? 30,
      })

      const results = JSON.parse(resultJson)

      const targets: TonightTarget[] = results.map((r: TonightTargetsResult['targets'][0]) => ({
        id: r.id,
        name: r.name,
        objectType: r.object_type,
        magnitude: r.magnitude,
        altitude: r.altitude,
        azimuth: r.azimuth,
        constellation: r.constellation,
      }))

      setTonightTargets(targets)
      return targets
    } catch (error) {
      console.error('Failed to get tonight targets:', error)
      return []
    } finally {
      setIsLoadingTargets(false)
    }
  }, [location, setTonightTargets, setIsLoadingTargets])

  /**
   * Set observer location
   */
  const setObserverLocation = useCallback((
    latitude: number,
    longitude: number,
    elevation: number = 0,
    name?: string
  ) => {
    setLocation({
      latitude,
      longitude,
      elevation,
      name,
    })
  }, [setLocation])

  /**
   * Get location from browser
   */
  const getLocationFromBrowser = useCallback(async () => {
    return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      if (!window.isSecureContext) {
        reject(new Error('Failed to get location: Geolocation requires HTTPS (or localhost).'))
        return
      }
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setLocation({
            latitude,
            longitude,
            elevation: 0,
            name: 'Current Location',
          })
          resolve({ latitude, longitude })
        },
        (error) => {
          reject(new Error(`Failed to get location: ${error.message}`))
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
        }
      )
    })
      .catch(async (error) => {
        // In web mode only, fall back to IP-based location.
        if (!runtime.isTauri) {
          const fallback = await invoke<{ success?: boolean; latitude?: number; longitude?: number; name?: string; error?: string }>(
            'get_ip_location'
          )
          if (fallback?.success && typeof fallback.latitude === 'number' && typeof fallback.longitude === 'number') {
            setLocation({
              latitude: fallback.latitude,
              longitude: fallback.longitude,
              elevation: 0,
              name: fallback.name || 'Approximate (IP)',
            })
            return { latitude: fallback.latitude, longitude: fallback.longitude }
          }
        }
        throw error
      })
  }, [setLocation])

  return {
    // State
    sessions,
    currentSession,
    observationLogs,
    tonightTargets,
    location,
    isLoadingTargets,

    // Session actions
    createSession,
    getSessions,
    endSession,
    removeSession,
    setCurrentSession,

    // Visibility
    getTargetVisibility,
    getTonightTargets,

    // Location
    setObserverLocation,
    getLocationFromBrowser,
  }
}
