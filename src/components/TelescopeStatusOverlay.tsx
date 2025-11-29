import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Cpu,
  X,
  ChevronDown,
  ChevronUp,
  Battery,
  BatteryCharging,
  Thermometer,
  Activity,
  RotateCw,
  TrendingUp,
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

interface StreamStatus {
  ra?: number
  dec?: number
  alt?: number
  az?: number
  stage?: string
  battery_capacity?: number
  charger_status?: string
  temp?: number
  stacked_frame?: number
  dropped_frame?: number
  skipped_frame?: number
  balance_sensor?: {
    data?: { x?: number; y?: number; z?: number }
  }
  server_browser_rtt_ms?: number
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

  const stackedFrames = streamStatus?.stacked_frame || 0
  const droppedFrames = streamStatus?.dropped_frame || 0
  const skippedFrames = streamStatus?.skipped_frame || 0

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
                      {streamStatus?.charger_status === 'Charging' ? (
                        <BatteryCharging className="w-4 h-4 text-green-400" />
                      ) : (
                        <Battery
                          className={`w-4 h-4 ${
                            (streamStatus?.battery_capacity ?? 0) > 20 ? 'text-green-400' : 'text-red-400'
                          }`}
                        />
                      )}
                      <span className="text-muted-foreground">Battery</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.battery_capacity != null
                        ? `${Math.round(streamStatus.battery_capacity)}%`
                        : '—'}
                    </span>
                  </div>

                  {/* Temperature */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Thermometer
                        className={`w-4 h-4 ${
                          (streamStatus?.temp ?? 50) < 40 ? 'text-blue-400' : 'text-orange-400'
                        }`}
                      />
                      <span className="text-muted-foreground">Temperature</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.temp != null ? `${streamStatus.temp.toFixed(1)}°C` : '—'}
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

            {/* Balance Section */}
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
                  {/* Tilt Angle - from balance_sensor.data.x */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-orange-400" />
                      <span className="text-muted-foreground">Tilt Angle</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.balance_sensor?.data?.x != null
                        ? `${streamStatus.balance_sensor.data.x.toFixed(1)}°`
                        : '—'}
                    </span>
                  </div>

                  {/* Rotation - from balance_sensor.data.y */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <RotateCw className="w-4 h-4 text-yellow-400" />
                      <span className="text-muted-foreground">Rotation</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.balance_sensor?.data?.y != null
                        ? `${streamStatus.balance_sensor.data.y.toFixed(1)}°`
                        : '—'}
                    </span>
                  </div>

                  {/* Z axis - from balance_sensor.data.z */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-muted-foreground">Z Axis</span>
                    </div>
                    <span className="font-mono">
                      {streamStatus?.balance_sensor?.data?.z != null
                        ? `${streamStatus.balance_sensor.data.z.toFixed(1)}°`
                        : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>

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
                  {/* Frame Counts */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-muted rounded px-2 py-1">
                      <div className="text-muted-foreground">Stacked</div>
                      <div className="font-mono">{stackedFrames}</div>
                    </div>
                    <div className="bg-muted rounded px-2 py-1">
                      <div className="text-muted-foreground">Dropped</div>
                      <div className="font-mono">{droppedFrames}</div>
                    </div>
                    <div className="bg-muted rounded px-2 py-1">
                      <div className="text-muted-foreground">Skipped</div>
                      <div className="font-mono">{skippedFrames}</div>
                    </div>
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

                  {/* Browser RTT */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Browser RTT</span>
                    <span className="font-mono">
                      {streamStatus?.server_browser_rtt_ms != null
                        ? `${streamStatus.server_browser_rtt_ms}ms`
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
