import { Battery, Thermometer, Droplets, Gauge, Crosshair, HardDrive } from 'lucide-react'
import { useTelescopeStore } from '../stores/telescopeStore'

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

export function StatusBar({ telescopeId }: StatusBarProps) {
  const status = useTelescopeStore((s) =>
    telescopeId ? s.telescopeStatus[telescopeId] : null
  )

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
