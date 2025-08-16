"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { 
  Cpu, 
  X, 
  ChevronDown, 
  ChevronUp,
  Activity,
  Battery,
  BatteryCharging,
  BatteryFull,
  Thermometer,
  Compass,
  RotateCw,
  Clock,
  TrendingUp
} from "lucide-react"
import { Button } from "@/components/ui/button"

// Helper function to convert RA degrees to HMS format
function raToHMS(raDegrees: number): string {
  // Convert degrees to hours (15 degrees per hour)
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

export function NetworkStatusOverlay() {
  const {
    showStreamStatus,
    setShowStreamStatus,
    currentTelescope,
    streamStatus: contextStreamStatus
  } = useTelescopeContext()

  // Use persistent state for overlay position
  const [overlayPosition, setOverlayPosition] = usePersistentState<{ x: number; y: number } | undefined>(
    'telescope-status-overlay-position',
    undefined
  )

  const overlayRef = useRef<HTMLDivElement>(null)
  const [localStreamStatus, setLocalStreamStatus] = useState<any>(null)
  const [imageTimingHistory, setImageTimingHistory] = useState<number[]>([])
  const [rttHistory, setRttHistory] = useState<number[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [cumulativeRotation, setCumulativeRotation] = useState(0)
  const previousRotationRef = useRef<number | null>(null)
  
  // State for collapsible sections
  const [collapsedSections, setCollapsedSections] = useState<{
    powerThermal: boolean
    coordinates: boolean
    balance: boolean
    imaging: boolean
    network: boolean
  }>({
    powerThermal: false,
    coordinates: false,
    balance: false,
    imaging: false,
    network: false
  })

  // Helper function to ensure position is within screen bounds
  const ensureWithinBounds = useCallback((pos: { x: number; y: number }) => {
    const overlayWidth = 320
    const overlayHeight = 400
    const padding = 20
    
    const maxX = window.innerWidth - overlayWidth - padding
    const maxY = window.innerHeight - overlayHeight - padding
    
    return {
      x: Math.min(Math.max(padding, pos.x), maxX),
      y: Math.min(Math.max(padding, pos.y), maxY)
    }
  }, [])

  // Initialize overlay position or ensure it's within bounds
  useEffect(() => {
    if (showStreamStatus && typeof window !== 'undefined') {
      if (overlayPosition === undefined) {
        // Position it in a visible location - center of screen initially
        const overlayWidth = 320
        const overlayHeight = 400
        
        // Start in center of screen
        const initialX = Math.max(20, (window.innerWidth - overlayWidth) / 2)
        const initialY = Math.max(20, Math.min(100, (window.innerHeight - overlayHeight) / 2))
        
        setOverlayPosition({ x: initialX, y: initialY })
      } else {
        // Ensure stored position is still within bounds
        const boundedPos = ensureWithinBounds(overlayPosition)
        if (boundedPos.x !== overlayPosition.x || boundedPos.y !== overlayPosition.y) {
          setOverlayPosition(boundedPos)
        }
      }
    }
  }, [showStreamStatus, overlayPosition, setOverlayPosition, ensureWithinBounds])
  
  // Handle window resize to keep overlay in bounds
  useEffect(() => {
    const handleResize = () => {
      if (overlayPosition && showStreamStatus) {
        const boundedPos = ensureWithinBounds(overlayPosition)
        if (boundedPos.x !== overlayPosition.x || boundedPos.y !== overlayPosition.y) {
          setOverlayPosition(boundedPos)
        }
      }
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [overlayPosition, showStreamStatus, setOverlayPosition, ensureWithinBounds])

  // Update local stream status from context
  useEffect(() => {
    if (contextStreamStatus) {
      setLocalStreamStatus(contextStreamStatus)
      
      // Update timing history if available (only positive values)
      if (contextStreamStatus.imaging_status?.last_image_elapsed_ms && 
          contextStreamStatus.imaging_status.last_image_elapsed_ms > 0) {
        setImageTimingHistory(prev => {
          const newHistory = [...prev.slice(-19), contextStreamStatus.imaging_status.last_image_elapsed_ms]
          return newHistory
        })
      }
      
      // Update RTT history if available (only positive values)
      if (contextStreamStatus.status?.server_browser_rtt_ms && 
          contextStreamStatus.status.server_browser_rtt_ms > 0) {
        setRttHistory(prev => {
          const newHistory = [...prev.slice(-19), contextStreamStatus.status.server_browser_rtt_ms]
          return newHistory
        })
      }
    }
  }, [contextStreamStatus])

  // Track cumulative rotation from balance sensor
  useEffect(() => {
    if (!localStreamStatus?.status?.balance_sensor?.data) return;
    
    const { x, y } = localStreamStatus.status.balance_sensor.data;
    if (x === undefined || y === undefined) return;
    
    const currentRotation = Math.atan2(y, x) * 180 / Math.PI;
    
    if (previousRotationRef.current !== null) {
      // Calculate the shortest angular difference
      let delta = currentRotation - previousRotationRef.current;
      
      // Normalize to [-180, 180]
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      
      // Only accumulate if the change is significant (more than 0.5 degrees)
      if (Math.abs(delta) > 0.5 && Math.abs(delta) < 45) {
        setCumulativeRotation(prev => prev + delta);
      }
    }
    
    previousRotationRef.current = currentRotation;
  }, [localStreamStatus?.status?.balance_sensor?.data])

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // Handle dragging - moved before conditional returns
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

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y

    const boundedPos = ensureWithinBounds({ x: newX, y: newY })
    setOverlayPosition(boundedPos)
  }, [isDragging, dragOffset.x, dragOffset.y, setOverlayPosition, ensureWithinBounds])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // This useEffect must be called before any conditional returns
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Conditional returns must be after all hooks
  if (!showStreamStatus) return null

  // If position not yet initialized, don't render
  if (!overlayPosition) return null

  const stackedFrames = localStreamStatus?.status?.stacked_frame || 0
  const droppedFrames = localStreamStatus?.status?.dropped_frame || 0
  const skippedFrames = localStreamStatus?.status?.skipped_frame || 0

  return (
    <div 
      ref={overlayRef} 
      className="fixed bg-black/90 backdrop-blur-sm rounded-lg text-sm w-80 shadow-xl border-2 border-gray-700 max-h-[90vh] overflow-y-auto" 
      style={{ 
        left: overlayPosition.x,
        top: overlayPosition.y,
        zIndex: 9999, 
        minHeight: '200px',
        cursor: isDragging ? "grabbing" : "default"
      }}
    >
      {/* Header with drag handle */}
      <div 
        className="cursor-move bg-gray-900/80 px-4 py-2 rounded-t-lg border-b border-gray-700 flex items-center justify-between"
        onMouseDown={handleMouseDown}
      >
          <h3 className="font-semibold text-blue-400 flex items-center gap-2 select-none">
            <Cpu className="w-4 h-4" />
            Telescope Status
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowStreamStatus(false)}
            className="h-6 w-6 p-0 hover:bg-gray-800"
          >
            <X className="h-4 w-4 text-gray-400" />
          </Button>
        </div>

        {/* Content sections */}
        <div className="p-4 space-y-4">
          {/* Power & Thermal Section */}
          <div className="space-y-2">
            <h4 
              className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-300"
              onClick={() => toggleSection('powerThermal')}
            >
              Power & Thermal
              {collapsedSections.powerThermal ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </h4>

            {!collapsedSections.powerThermal && (
              <>
                {/* Battery */}
                {localStreamStatus?.status?.battery_capacity !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {localStreamStatus?.status?.charger_status === "Charging" ? (
                        <BatteryCharging className="w-4 h-4 text-green-400" />
                      ) : localStreamStatus?.status?.charger_status === "Full" ? (
                        <BatteryFull className="w-4 h-4 text-green-400" />
                      ) : (
                        <Battery className={`w-4 h-4 ${localStreamStatus?.status?.battery_capacity > 20 ? "text-green-400" : "text-red-400"}`} />
                      )}
                      <span className="text-gray-300">Battery</span>
                    </div>
                    <span className="text-white font-mono">{Math.round(localStreamStatus.status.battery_capacity)}%</span>
                  </div>
                )}

                {/* Temperature */}
                {localStreamStatus?.status?.temp !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Thermometer className={`w-4 h-4 ${localStreamStatus?.status?.temp < 30 ? "text-blue-400" : "text-orange-400"}`} />
                      <span className="text-gray-300">Temperature</span>
                    </div>
                    <span className="text-white font-mono">{localStreamStatus.status.temp.toFixed(1)}°C</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Coordinates Section */}
          <div className="space-y-2">
            <h4 
              className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-300"
              onClick={() => toggleSection('coordinates')}
            >
              Coordinates
              {collapsedSections.coordinates ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </h4>

            {!collapsedSections.coordinates && (
              <>
                {/* Altitude */}
                {localStreamStatus?.status?.alt !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      <span className="text-gray-300">Altitude</span>
                    </div>
                    <span className="text-white font-mono">{localStreamStatus.status.alt.toFixed(1)}°</span>
                  </div>
                )}

                {/* Azimuth */}
                {localStreamStatus?.status?.az !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-blue-400" />
                      <span className="text-gray-300">Azimuth</span>
                    </div>
                    <span className="text-white font-mono">{localStreamStatus.status.az.toFixed(1)}°</span>
                  </div>
                )}

                {/* RA */}
                {localStreamStatus?.status?.ra !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-300">RA</span>
                      <div className="text-right">
                        <div className="text-white font-mono">{raToHMS(localStreamStatus.status.ra)}</div>
                        <div className="text-gray-400 text-xs font-mono">{localStreamStatus.status.ra.toFixed(2)}° ({(localStreamStatus.status.ra / 15).toFixed(4)}h)</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dec */}
                {localStreamStatus?.status?.dec !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-300">Dec</span>
                      <div className="text-right">
                        <div className="text-white font-mono">{decToDMS(localStreamStatus.status.dec)}</div>
                        <div className="text-gray-400 text-xs font-mono">{localStreamStatus.status.dec.toFixed(4)}°</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Balance Section */}
          {(localStreamStatus?.status?.balance_sensor?.data || 
            localStreamStatus?.status?.pitch !== undefined || 
            localStreamStatus?.status?.roll !== undefined) && (
            <div className="space-y-2">
              <h4 
                className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-300"
                onClick={() => toggleSection('balance')}
              >
                Balance
                {collapsedSections.balance ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </h4>

              {!collapsedSections.balance && (
                <>
                  {/* Balance sensor data if available */}
                  {localStreamStatus?.status?.balance_sensor?.data && (
                    <>
                      {/* Tilt Angle from Z accelerometer */}
                      {localStreamStatus.status.balance_sensor.data.z !== undefined && (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-orange-400" />
                            <span className="text-gray-300">Tilt Angle</span>
                          </div>
                          <span className="text-white font-mono">
                            {(Math.acos(Math.min(1, Math.max(-1, localStreamStatus.status.balance_sensor.data.z))) * 180 / Math.PI).toFixed(1)}°
                          </span>
                        </div>
                      )}
                      
                      {/* Rotation Angle from X and Y */}
                      {(localStreamStatus.status.balance_sensor.data.x !== undefined && 
                        localStreamStatus.status.balance_sensor.data.y !== undefined) && (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <RotateCw className="w-4 h-4 text-yellow-400" />
                              <span className="text-gray-300">Rotation</span>
                            </div>
                            <span className="text-white font-mono">
                              {(Math.atan2(
                                localStreamStatus.status.balance_sensor.data.y, 
                                localStreamStatus.status.balance_sensor.data.x
                              ) * 180 / Math.PI).toFixed(1)}°
                            </span>
                          </div>
                          
                          {/* Cumulative Rotation */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-green-400" />
                              <span className="text-gray-300">Cumulative</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-mono">
                                {cumulativeRotation.toFixed(1)}°
                              </span>
                              <button
                                onClick={() => {
                                  setCumulativeRotation(0);
                                  previousRotationRef.current = null;
                                }}
                                className="text-gray-400 hover:text-white transition-colors p-0.5"
                                title="Reset cumulative rotation"
                              >
                                <RotateCw className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Pitch - fallback if no balance sensor data */}
                  {!localStreamStatus?.status?.balance_sensor?.data && localStreamStatus?.status?.pitch !== undefined && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-green-400" />
                        <span className="text-gray-300">Pitch</span>
                      </div>
                      <span className="text-white font-mono">{localStreamStatus.status.pitch.toFixed(1)}°</span>
                    </div>
                  )}

                  {/* Roll - fallback if no balance sensor data */}
                  {!localStreamStatus?.status?.balance_sensor?.data && localStreamStatus?.status?.roll !== undefined && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-green-400" />
                        <span className="text-gray-300">Roll</span>
                      </div>
                      <span className="text-white font-mono">{localStreamStatus.status.roll.toFixed(1)}°</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Imaging Section */}
          <div className="space-y-2">
            <h4 
              className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-300"
              onClick={() => toggleSection('imaging')}
            >
              Imaging
              {collapsedSections.imaging ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </h4>

            {!collapsedSections.imaging && (
              <>
                {/* Client Mode / Stage */}
                {localStreamStatus?.status?.stage && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-400" />
                      <span className="text-gray-300">Mode</span>
                    </div>
                    <span className="text-white font-mono">
                      {localStreamStatus.status.stage === 'RTSP' ? 'Streaming' : 
                       localStreamStatus.status.stage === 'Stack' ? 'Stacking' :
                       localStreamStatus.status.stage === 'ContinuousExposure' ? 'Live View' :
                       localStreamStatus.status.stage === 'AutoGoto' ? 'Auto Goto' :
                       localStreamStatus.status.stage === 'ScopeGoto' ? 'Scope Goto' :
                       localStreamStatus.status.stage === 'AutoFocus' ? 'Auto Focus' :
                       localStreamStatus.status.stage === 'Initialise' ? 'Dark Library' :
                       localStreamStatus.status.stage}
                    </span>
                  </div>
                )}

                {/* Frame Counts */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-400">Stacked</div>
                    <div className="text-white font-mono">{stackedFrames}</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-400">Dropped</div>
                    <div className="text-white font-mono">{droppedFrames}</div>
                  </div>
                  <div className="bg-gray-800 rounded px-2 py-1">
                    <div className="text-gray-400">Skipped</div>
                    <div className="text-white font-mono">{skippedFrames}</div>
                  </div>
                </div>

                {/* Image Timing */}
                {localStreamStatus?.imaging_status?.last_image_elapsed_ms !== undefined && 
                 localStreamStatus.imaging_status.last_image_elapsed_ms > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-yellow-400" />
                      <span className="text-gray-300">Last Image</span>
                    </div>
                    <span className="text-white font-mono">{Math.round(localStreamStatus.imaging_status.last_image_elapsed_ms)}ms</span>
                  </div>
                )}

                {/* Mini timing graph */}
                {imageTimingHistory.length > 1 && (
                  <div className="h-12 bg-gray-800 rounded p-1">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polyline
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="2"
                        points={imageTimingHistory.map((val, i) => {
                          const x = (i / (imageTimingHistory.length - 1)) * 100
                          const maxVal = Math.max(...imageTimingHistory, 1000)
                          const minVal = Math.min(...imageTimingHistory, 0)
                          const range = maxVal - minVal || 1
                          const y = 100 - ((val - minVal) / range) * 100
                          return `${x},${y}`
                        }).join(' ')}
                      />
                    </svg>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Network Section */}
          <div className="space-y-2">
            <h4 
              className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-300"
              onClick={() => toggleSection('network')}
            >
              Network
              {collapsedSections.network ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </h4>

            {!collapsedSections.network && (
              <>
                {/* Connection Status */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className={`w-4 h-4 ${localStreamStatus?.status?.server_browser_rtt_ms ? "text-green-400" : "text-red-400"}`} />
                    <span className="text-gray-300">Status</span>
                  </div>
                  <span className="text-white font-mono">
                    {localStreamStatus?.status?.server_browser_rtt_ms ? "Connected" : "Disconnected"}
                  </span>
                </div>

                {/* RTT */}
                {localStreamStatus?.status?.server_browser_rtt_ms !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-300">Browser RTT</span>
                    <span className="text-white font-mono">{Math.round(localStreamStatus.status.server_browser_rtt_ms)}ms</span>
                  </div>
                )}

                {/* Telescope RTT */}
                {localStreamStatus?.status?.server_telescope_rtt_ms !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-300">Telescope RTT</span>
                    <span className="text-white font-mono">{Math.round(localStreamStatus.status.server_telescope_rtt_ms)}ms</span>
                  </div>
                )}

                {/* Mini RTT graph */}
                {rttHistory.length > 1 && (
                  <div className="h-12 bg-gray-800 rounded p-1">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                        points={rttHistory.map((val, i) => {
                          const x = (i / (rttHistory.length - 1)) * 100
                          const maxVal = Math.max(...rttHistory, 100)
                          const minVal = Math.min(...rttHistory, 0)
                          const range = maxVal - minVal || 1
                          const y = 100 - ((val - minVal) / range) * 100
                          return `${x},${y}`
                        }).join(' ')}
                      />
                    </svg>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
    </div>
  )
}