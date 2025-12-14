import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Cpu,
  X,
  ChevronDown,
  ChevronUp,
  Battery,
  Thermometer,
  Activity,
  TrendingUp,
  RotateCw,
  Minimize2,
  Maximize2,
} from 'lucide-react'
import { Button } from './ui/button'
import { useUIStore } from '../stores/uiStore'
import { useTelescopeStore } from '../stores/telescopeStore'
import { invoke } from '../services/api'

// Helper function to convert RA degrees to HMS format
function raToHMS(raDegrees: number): string {
  const raHours = raDegrees / 15
  const hours = Math.floor(raHours)
  const minutesDecimal = (raHours - hours) * 60
  const minutes = Math.floor(minutesDecimal)
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(1)
  return `${hours}h ${minutes}m ${seconds}s`
}

// Helper function to convert Dec degrees to DMS format
function decToDMS(decDegrees: number): string {
  const sign = decDegrees < 0 ? '-' : '+'
  const absDec = Math.abs(decDegrees)
  const degrees = Math.floor(absDec)
  const minutesDecimal = (absDec - degrees) * 60
  const minutes = Math.floor(minutesDecimal)
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(1)
  return `${sign}${degrees}° ${minutes}' ${seconds}"`
}

interface BalanceSensorData {
  x?: number
  y?: number
  z?: number
  angle?: number
}

interface StreamStatus {
  connected: boolean
  ra?: number
  dec?: number
  alt?: number
  az?: number
  viewState?: string  // camelCase from Rust serde
  batteryPercent?: number
  temperatureC?: number
  humidityPercent?: number
  dewHeaterPower?: number
  isGoto?: boolean
  isTracking?: boolean
  gain?: number
  focusPosition?: number
  stackedFrame?: number
  targetName?: string
  freeMb?: number
  totalMb?: number
  balanceSensor?: BalanceSensorData
}

export function TelescopeStatusOverlay() {
  const { showTelescopeStatus, setShowTelescopeStatus } = useUIStore()
  const { currentTelescopeId } = useTelescopeStore()
  const currentTelescope = useTelescopeStore((state) =>
    state.telescopes.find((t) => t.id === state.currentTelescopeId)
  )

  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null)
  const [overlayPosition, setOverlayPosition] = useState<{ x: number; y: number } | undefined>(undefined)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [collapsedSections, setCollapsedSections] = useState({
    powerThermal: false,
    coordinates: false,
    balance: false,
    imaging: false,
    network: false,
  })

  const overlayRef = useRef<HTMLDivElement>(null)

  const isConnected = currentTelescope?.status === 'connected'

  // Helper function to ensure position is within screen bounds
  const ensureWithinBounds = useCallback((pos: { x: number; y: number }) => {
    const overlayWidth = 320
    const overlayHeight = 400
    const padding = 20

    const maxX = window.innerWidth - overlayWidth - padding
    const maxY = window.innerHeight - overlayHeight - padding

    return {
      x: Math.min(Math.max(padding, pos.x), maxX),
      y: Math.min(Math.max(padding, pos.y), maxY),
    }
  }, [])

  // Initialize overlay position
  useEffect(() => {
    if (showTelescopeStatus && typeof window !== 'undefined') {
      if (overlayPosition === undefined) {
        const overlayWidth = 320
        const padding = 20
        const initialX = window.innerWidth - overlayWidth - padding
        const initialY = padding + 60 // Below header
        setOverlayPosition({ x: initialX, y: initialY })
      } else {
        const boundedPos = ensureWithinBounds(overlayPosition)
        if (boundedPos.x !== overlayPosition.x || boundedPos.y !== overlayPosition.y) {
          setOverlayPosition(boundedPos)
        }
      }
    }
  }, [showTelescopeStatus, overlayPosition, ensureWithinBounds])

  // Fetch status periodically - only when connected
  useEffect(() => {
    if (!currentTelescopeId) {
      setStreamStatus(null)
      return
    }

    // Only fetch status if we have a valid telescope selected
    // Don't require isConnected since we want to show disconnected state too
    const fetchStatus = async () => {
      try {
        const result = await invoke<StreamStatus>('get_telescope_status', {
          telescopeId: currentTelescopeId,
        })
        setStreamStatus(result)
      } catch (error) {
        // Silently ignore errors - telescope may not be in backend state yet
        // This happens during initial discovery before connection
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [currentTelescopeId])

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    const rect = overlayRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y
      const boundedPos = ensureWithinBounds({ x: newX, y: newY })
      setOverlayPosition(boundedPos)
    },
    [isDragging, dragOffset.x, dragOffset.y, ensureWithinBounds]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  if (!showTelescopeStatus || !overlayPosition) return null

  const stackedFrames = streamStatus?.stackedFrame || 0

  return (
    <>
      <div
        ref={overlayRef}
        className={`fixed bg-card/95 backdrop-blur-sm rounded-lg text-sm shadow-xl border-2 border-border ${
          isMinimized ? 'w-auto' : 'w-80 max-h-[90vh] overflow-y-auto'
        }`}
        style={{
          left: overlayPosition.x,
          top: overlayPosition.y,
          zIndex: 9999,
          minHeight: isMinimized ? 'auto' : '200px',
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* Header with drag handle */}
        <div
          className="cursor-move bg-background/80 px-4 py-2 rounded-t-lg border-b border-border flex items-center justify-between"
          onMouseDown={handleMouseDown}
        >
          <h3 className="font-semibold text-blue-400 flex items-center gap-2 select-none">
            <Cpu className="w-4 h-4" />
            Telescope Status
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-6 w-6 p-0 hover:bg-accent"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Minimize2 className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTelescopeStatus(false)}
              className="h-6 w-6 p-0 hover:bg-accent"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Content sections - only show if not minimized */}
        {!isMinimized && (
          <div className="p-4 space-y-4">
            {/* Power & Thermal Section */}
            <div className="space-y-2">
              <h4
                className="text-xs font-semibold uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-foreground"
                onClick={() => toggleSection('powerThermal')}
              >
                Power & Thermal
                {collapsedSections.powerThermal ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </h4>

              {!collapsedSections.powerThermal && (
                <>
                  {/* Battery */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Battery
                        className={`w-4 h-4 ${
                          (streamStatus?.batteryPercent ?? 0) > 20 ? 'text-green-400' : 'text-red-400'
                        }`}
                      />
                      <span className="text-muted-foreground">Battery</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.batteryPercent != null
                        ? `${Math.round(streamStatus.batteryPercent)}%`
                        : '—'}
                    </span>
                  </div>

                  {/* Temperature */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Thermometer
                        className={`w-4 h-4 ${
                          (streamStatus?.temperatureC ?? 50) < 40 ? 'text-blue-400' : 'text-orange-400'
                        }`}
                      />
                      <span className="text-muted-foreground">Temperature</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.temperatureC != null ? `${streamStatus.temperatureC.toFixed(1)}°C` : '—'}
                    </span>
                  </div>

                  {/* Gain */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-400" />
                      <span className="text-muted-foreground">Gain</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.gain != null ? streamStatus.gain : '—'}
                    </span>
                  </div>

                  {/* Focus Position */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-cyan-400" />
                      <span className="text-muted-foreground">Focus</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.focusPosition != null ? streamStatus.focusPosition : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Coordinates Section */}
            <div className="space-y-2">
              <h4
                className="text-xs font-semibold uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-foreground"
                onClick={() => toggleSection('coordinates')}
              >
                Coordinates
                {collapsedSections.coordinates ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </h4>

              {!collapsedSections.coordinates && (
                <>
                  {/* RA */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">RA</span>
                      <div className="text-right">
                        <div className="font-mono">
                          {streamStatus?.ra != null ? raToHMS(streamStatus.ra) : '—'}
                        </div>
                        <div className="text-muted-foreground text-xs font-mono">
                          {streamStatus?.ra != null
                            ? `${streamStatus.ra.toFixed(2)}° (${(streamStatus.ra / 15).toFixed(4)}h)`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dec */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Dec</span>
                      <div className="text-right">
                        <div className="font-mono">
                          {streamStatus?.dec != null ? decToDMS(streamStatus.dec) : '—'}
                        </div>
                        <div className="text-muted-foreground text-xs font-mono">
                          {streamStatus?.dec != null ? `${streamStatus.dec.toFixed(4)}°` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Balance Section - only show if balance sensor data is available */}
            {streamStatus?.balanceSensor && (
              <div className="space-y-2">
                <h4
                  className="text-xs font-semibold uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-foreground"
                  onClick={() => toggleSection('balance')}
                >
                  Balance
                  {collapsedSections.balance ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronUp className="w-3 h-3" />
                  )}
                </h4>

                {!collapsedSections.balance && (
                  <>
                    {/* Tilt Angle - calculated from Z accelerometer */}
                    {streamStatus.balanceSensor.z != null && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-orange-400" />
                          <span className="text-muted-foreground">Tilt Angle</span>
                        </div>
                        <span className="font-mono">
                          {(Math.acos(Math.min(1, Math.max(-1, streamStatus.balanceSensor.z))) * 180 / Math.PI).toFixed(1)}°
                        </span>
                      </div>
                    )}

                    {/* Rotation Angle - calculated from X and Y */}
                    {streamStatus.balanceSensor.x != null && streamStatus.balanceSensor.y != null && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <RotateCw className="w-4 h-4 text-yellow-400" />
                          <span className="text-muted-foreground">Rotation</span>
                        </div>
                        <span className="font-mono">
                          {(Math.atan2(streamStatus.balanceSensor.y, streamStatus.balanceSensor.x) * 180 / Math.PI).toFixed(1)}°
                        </span>
                      </div>
                    )}

                    {/* Raw angle from sensor if available */}
                    {streamStatus.balanceSensor.angle != null && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-400" />
                          <span className="text-muted-foreground">Sensor Angle</span>
                        </div>
                        <span className="font-mono">
                          {streamStatus.balanceSensor.angle.toFixed(1)}°
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Imaging Section */}
            <div className="space-y-2">
              <h4
                className="text-xs font-semibold uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-foreground"
                onClick={() => toggleSection('imaging')}
              >
                Imaging
                {collapsedSections.imaging ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </h4>

              {!collapsedSections.imaging && (
                <>
                  {/* Stacked Frames */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Stacked Frames</span>
                    <span className="font-mono">{stackedFrames}</span>
                  </div>

                  {/* Target Name */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Target</span>
                    <span className="font-mono">
                      {streamStatus?.targetName || '—'}
                    </span>
                  </div>

                  {/* View State */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Mode</span>
                    <span className="font-mono">
                      {streamStatus?.viewState || '—'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Network Section */}
            <div className="space-y-2">
              <h4
                className="text-xs font-semibold uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-foreground"
                onClick={() => toggleSection('network')}
              >
                Network
                {collapsedSections.network ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </h4>

              {!collapsedSections.network && (
                <>
                  {/* Connection Status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Activity
                        className={`w-4 h-4 ${isConnected ? 'text-green-400' : 'text-red-400'}`}
                      />
                      <span className="text-muted-foreground">Status</span>
                    </div>
                    <span className="font-mono">{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>

                  {/* Disk Space */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Disk Space</span>
                    <span className="font-mono">
                      {streamStatus?.freeMb != null && streamStatus?.totalMb != null
                        ? `${(streamStatus.freeMb / 1024).toFixed(1)} / ${(streamStatus.totalMb / 1024).toFixed(1)} GB`
                        : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
