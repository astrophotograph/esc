import { useEffect, useRef } from 'react'
import { invoke } from '../services/api'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useUIStore } from '../stores/uiStore'

// When connected and active, poll this fast; when moving, use FAST interval.
// These are the *minimum* gaps between polls — the next poll doesn't fire until
// the previous one returns, so a slow/broken connection won't pile up requests.
const NORMAL_POLL_INTERVAL = 2000
const FAST_POLL_INTERVAL = 500
// When disconnected, back off significantly — the telescope may be reconnecting
const DISCONNECTED_POLL_INTERVAL = 5000

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
 *
 * Uses a sequential setTimeout chain rather than setInterval so that only one
 * request is ever in-flight at a time. This prevents a storm of concurrent
 * commands from piling up when the telescope connection is slow or broken.
 */
export function useTelescopeStatusPoller() {
  const currentTelescopeId = useTelescopeStore((s) => s.currentTelescopeId)
  const updateTelescopeStatus = useTelescopeStore((s) => s.updateTelescopeStatus)
  const clearTelescopeStatus = useTelescopeStore((s) => s.clearTelescopeStatus)
  const isManuallyMoving = useUIStore((s) => s.isManuallyMoving)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)
  const isMovingRef = useRef(false)

  useEffect(() => {
    if (!currentTelescopeId) return

    const telescopeId = currentTelescopeId
    activeRef.current = true
    isMovingRef.current = isManuallyMoving

    const scheduleNext = (delayMs: number) => {
      if (!activeRef.current) return
      timerRef.current = setTimeout(poll, delayMs)
    }

    const poll = async () => {
      if (!activeRef.current) return
      try {
        const result = await invoke<RawTelescopeStatus>('get_telescope_status', { telescopeId })

        if (!activeRef.current) return

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

        const moving = result.isGoto === true || isMovingRef.current
        const nextDelay = !result.connected
          ? DISCONNECTED_POLL_INTERVAL
          : moving
          ? FAST_POLL_INTERVAL
          : NORMAL_POLL_INTERVAL
        scheduleNext(nextDelay)
      } catch {
        // Tauri command error — back off and retry
        scheduleNext(DISCONNECTED_POLL_INTERVAL)
      }
    }

    // Brief delay on first poll so the connection settles before we
    // send the first batch of status commands.
    scheduleNext(3000)

    return () => {
      activeRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [currentTelescopeId, updateTelescopeStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep moving ref in sync without restarting the poll loop
  useEffect(() => {
    isMovingRef.current = isManuallyMoving
  }, [isManuallyMoving])
}
