import { useEffect, useState } from 'react'
import { invoke } from '../services/api'
import { Battery, Thermometer, Droplets, Gauge } from 'lucide-react'

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
}

interface StatusBarProps {
  telescopeId?: string
}

export function StatusBar({ telescopeId }: StatusBarProps) {
  const [status, setStatus] = useState<TelescopeStatus | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!telescopeId) {
      setStatus(null)
      return
    }

    // Fetch status immediately
    fetchStatus()

    // Poll every 2 seconds for real-time updates
    const interval = setInterval(fetchStatus, 2000)

    return () => clearInterval(interval)
  }, [telescopeId])

  const fetchStatus = async () => {
    if (!telescopeId) return

    try {
      setLoading(true)
      const result = await invoke<TelescopeStatus>('get_telescope_status', {
        telescopeId
      })
      setStatus(result)
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setLoading(false)
    }
  }

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

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-card border-b text-sm">
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
