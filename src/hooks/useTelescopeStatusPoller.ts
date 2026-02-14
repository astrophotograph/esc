import { useEffect, useRef } from 'react'
import { invoke } from '../services/api'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useUIStore } from '../stores/uiStore'

const NORMAL_POLL_INTERVAL = 2000
const FAST_POLL_INTERVAL = 500

interface RawTelescopeStatus {
  connected?: boolean
  ra?: number
  dec?: number
  alt?: number
  az?: number
  tracking?: boolean
  slewing?: boolean
  parked?: boolean
  focusPosition?: number
  gain?: number
  gainMode?: string
  mountType?: string
  isTracking?: boolean
  isGoto?: boolean
  temperatureC?: number
  batteryPercent?: number
  humidityPercent?: number
  dewHeaterPower?: number
  viewState?: string
  stage?: string
  stackedFrame?: number
  targetName?: string
  freeMb?: number
  totalMb?: number
  balanceSensor?: { x?: number; y?: number; z?: number; angle?: number }
}

/**
 * Single centralized poller for telescope status.
 * Call once in App.tsx. Writes results to the Zustand store.
 * All components read from the store instead of polling independently.
 */
export function useTelescopeStatusPoller() {
  const currentTelescopeId = useTelescopeStore((s) => s.currentTelescopeId)
  const updateTelescopeStatus = useTelescopeStore((s) => s.updateTelescopeStatus)
  const clearTelescopeStatus = useTelescopeStore((s) => s.clearTelescopeStatus)
  const isManuallyMoving = useUIStore((s) => s.isManuallyMoving)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMovingRef = useRef(false)

  useEffect(() => {
    if (!currentTelescopeId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const telescopeId = currentTelescopeId

    const fetchStatus = async () => {
      try {
        const result = await invoke<RawTelescopeStatus>('get_telescope_status', {
          telescopeId,
        })

        // Normalize focusPosition -> focuserPosition for the store
        updateTelescopeStatus(telescopeId, {
          connected: result.connected,
          ra: result.ra,
          dec: result.dec,
          alt: result.alt,
          az: result.az,
          tracking: result.tracking,
          slewing: result.slewing,
          parked: result.parked,
          focuserPosition: result.focusPosition,
          gain: result.gain,
          gainMode: result.gainMode,
          mountType: result.mountType,
          isTracking: result.isTracking,
          isGoto: result.isGoto,
          temperatureC: result.temperatureC,
          batteryPercent: result.batteryPercent,
          humidityPercent: result.humidityPercent,
          dewHeaterPower: result.dewHeaterPower,
          viewState: result.viewState,
          stage: result.stage,
          stackedFrame: result.stackedFrame,
          targetName: result.targetName,
          freeMb: result.freeMb,
          totalMb: result.totalMb,
          balanceSensor: result.balanceSensor,
        })

        // Adjust polling rate based on movement state
        const isCurrentlyMoving = result.isGoto === true || isManuallyMoving
        if (isCurrentlyMoving !== isMovingRef.current) {
          isMovingRef.current = isCurrentlyMoving
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
          }
          const interval = isCurrentlyMoving ? FAST_POLL_INTERVAL : NORMAL_POLL_INTERVAL
          intervalRef.current = setInterval(fetchStatus, interval)
        }
      } catch {
        // Silently ignore - telescope may not be in backend state yet
      }
    }

    // Reset movement tracking for new telescope
    isMovingRef.current = false

    // Fetch immediately
    fetchStatus()

    // Start polling at rate based on current movement state
    const initialInterval = isManuallyMoving ? FAST_POLL_INTERVAL : NORMAL_POLL_INTERVAL
    intervalRef.current = setInterval(fetchStatus, initialInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      clearTelescopeStatus(telescopeId)
    }
  }, [currentTelescopeId, isManuallyMoving, updateTelescopeStatus, clearTelescopeStatus])
}
