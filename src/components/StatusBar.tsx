import { useEffect, useState, useRef } from 'react'
import { invoke } from '../services/api'
import { Battery, Thermometer, Droplets, Gauge, Crosshair, HardDrive } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'

interface TelescopeStatus {
  connected: boolean
  batteryPercent?: number
  temperatureC?: number
  humidityPercent?: number
  dewHeaterPower?: number
  ra?: number
  dec?: number
  isGoto?: boolean
  isTracking?: boolean
  viewState?: string
  freeMb?: number
  totalMb?: number
}

function formatRaDec(value: number | undefined, type: 'ra' | 'dec'): string {
  if (value === undefined || value === null) return 'N/A'

  if (type === 'ra') {
    const hours = Math.floor(value / 15)
    const minutes = Math.floor((value % 15) * 4)
    const seconds = Math.round(((value % 15) * 4 - minutes) * 60)
    return `${hours}h ${minutes}m ${seconds}s`
  } else {
    const sign = value >= 0 ? '+' : '-'
    const absValue = Math.abs(value)
    const degrees = Math.floor(absValue)
    const minutes = Math.floor((absValue - degrees) * 60)
    const seconds = Math.round(((absValue - degrees) * 60 - minutes) * 60)
    return `${sign}${degrees}° ${minutes}' ${seconds}"`
  }
}

interface StatusBarProps {
  telescopeId?: string
}

// Polling intervals in milliseconds
const FAST_POLL_INTERVAL = 500  // When telescope is moving
const NORMAL_POLL_INTERVAL = 2000  // Normal operation

export function StatusBar({ telescopeId }: StatusBarProps) {
  const [status, setStatus] = useState<TelescopeStatus | null>(null)
  const [_loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMovingRef = useRef(false)
  const isManuallyMoving = useUIStore((state) => state.isManuallyMoving)

  const fetchStatus = async () => {
    if (!telescopeId) return

    try {
      setLoading(true)
      const result = await invoke<TelescopeStatus>('get_telescope_status', {
        telescopeId
      })
      setStatus(result)

      // Check if telescope is moving (slewing via goto OR manual joystick control)
      const isCurrentlyMoving = result.isGoto === true || isManuallyMoving

      // If movement state changed, update the polling interval
      if (isCurrentlyMoving !== isMovingRef.current) {
        isMovingRef.current = isCurrentlyMoving

        // Clear existing interval and set new one with appropriate rate
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
        const pollInterval = isCurrentlyMoving ? FAST_POLL_INTERVAL : NORMAL_POLL_INTERVAL
        intervalRef.current = setInterval(fetchStatus, pollInterval)
      }
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setLoading(false)
    }
  }

  // Re-run effect when isManuallyMoving changes to update polling rate immediately
  useEffect(() => {
    if (!telescopeId) {
      setStatus(null)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Fetch status immediately
    fetchStatus()

    // Set polling interval based on current movement state
    const pollInterval = isManuallyMoving ? FAST_POLL_INTERVAL : NORMAL_POLL_INTERVAL
    intervalRef.current = setInterval(fetchStatus, pollInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [telescopeId, isManuallyMoving])

  if (!telescopeId || !status?.connected) {
    return null
  }

  const formatBattery = (percent?: number) => {
    if (percent === undefined || percent === null) return '--'
    return `${Math.round(percent)}%`
  }

  const formatTemp = (temp?: number) => {
    if (temp === undefined || temp === null) return '--°C'
    return `${temp.toFixed(1)}°C`
  }

  const formatHumidity = (humidity?: number) => {
    if (humidity === undefined || humidity === null) return '--'
    return `${Math.round(humidity)}%`
  }

  const getBatteryColor = (percent?: number) => {
    if (!percent) return 'text-gray-400'
    if (percent > 50) return 'text-green-500'
    if (percent > 20) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getDiskUsage = () => {
    if (status.freeMb !== undefined && status.totalMb !== undefined && status.totalMb > 0) {
      return Math.round(((status.totalMb - status.freeMb) / status.totalMb) * 100)
    }
    return undefined
  }

  const getDiskColor = (usage?: number) => {
    if (usage === undefined) return 'text-gray-400'
    if (usage >= 90) return 'text-red-500'
    if (usage >= 80) return 'text-yellow-500'
    return 'text-green-500'
  }

  const diskUsage = getDiskUsage()

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-card border-b text-sm">
      {/* RA/Dec Coordinates */}
      <div className="flex items-center gap-2">
        <Crosshair className="h-4 w-4 text-cyan-500" />
        <span className="font-mono text-xs">
          RA: {formatRaDec(status.ra, 'ra')}
        </span>
        <span className="font-mono text-xs">
          Dec: {formatRaDec(status.dec, 'dec')}
        </span>
      </div>

      <div className="h-4 border-l border-border" />

      {/* Battery */}
      <div className="flex items-center gap-2">
        <Battery className={`h-4 w-4 ${getBatteryColor(status.batteryPercent)}`} />
        <span className="font-mono">{formatBattery(status.batteryPercent)}</span>
      </div>

      {/* Temperature */}
      <div className="flex items-center gap-2">
        <Thermometer className="h-4 w-4 text-orange-500" />
        <span className="font-mono">{formatTemp(status.temperatureC)}</span>
      </div>

      {/* Humidity */}
      <div className="flex items-center gap-2">
        <Droplets className="h-4 w-4 text-blue-500" />
        <span className="font-mono">{formatHumidity(status.humidityPercent)}</span>
      </div>

      {/* Disk Usage */}
      <div className="flex items-center gap-2">
        <HardDrive className={`h-4 w-4 ${getDiskColor(diskUsage)}`} />
        <span className="font-mono">
          {diskUsage !== undefined ? `${diskUsage}%` : '--'}
        </span>
      </div>

      {/* Dew Heater (if active) */}
      {status.dewHeaterPower !== undefined && status.dewHeaterPower > 0 && (
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-purple-500" />
          <span className="font-mono">Heater: {status.dewHeaterPower}%</span>
        </div>
      )}

      {/* View State */}
      {status.viewState && (
        <div className="ml-auto">
          <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-semibold">
            {status.viewState}
          </span>
        </div>
      )}

      {/* Tracking/GOTO indicator */}
      {(status.isTracking || status.isGoto) && (
        <div className="flex gap-2">
          {status.isTracking && (
            <span className="px-2 py-1 rounded bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-semibold">
              TRACKING
            </span>
          )}
          {status.isGoto && (
            <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs font-semibold">
              SLEWING
            </span>
          )}
        </div>
      )}
    </div>
  )
}
