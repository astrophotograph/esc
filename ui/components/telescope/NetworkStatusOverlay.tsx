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
  TrendingUp,
  Info,
  HardDrive,
  AlertTriangle,
  Minimize2,
  Maximize2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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
  const [currentImageElapsed, setCurrentImageElapsed] = useState<number | null>(null)
  const [stackEventIndices, setStackEventIndices] = useState<number[]>([])
  const [dropEventIndices, setDropEventIndices] = useState<number[]>([])
  const previousStackedFrameRef = useRef<number>(0)
  const previousDroppedFrameRef = useRef<number>(0)
  const [dataTransferHistory, setDataTransferHistory] = useState<number[]>([])  // MB/s history
  const [isMinimized, setIsMinimized] = usePersistentState<boolean>(
    'telescope-status-overlay-minimized',
    false
  )

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
      
      // Check for stack events (when stacked_frame count increases)
      const currentStackedFrames = contextStreamStatus.status?.stacked_frame || 0
      if (currentStackedFrames > previousStackedFrameRef.current) {
        // A stack event occurred - mark it at the current position in history
        setStackEventIndices(prev => {
          const currentIndex = imageTimingHistory.length
          // Keep only recent indices (matching the history length)
          const recentIndices = prev.filter(idx => idx > currentIndex - 20)
          return [...recentIndices, currentIndex]
        })
      }
      previousStackedFrameRef.current = currentStackedFrames
      
      // Check for dropped frame events (when dropped_frame count increases)
      const currentDroppedFrames = contextStreamStatus.status?.dropped_frame || 0
      if (currentDroppedFrames > previousDroppedFrameRef.current) {
        // A frame drop occurred - mark it at the current position in history
        setDropEventIndices(prev => {
          const currentIndex = imageTimingHistory.length
          // Keep only recent indices (matching the history length)
          const recentIndices = prev.filter(idx => idx > currentIndex - 20)
          return [...recentIndices, currentIndex]
        })
      }
      previousDroppedFrameRef.current = currentDroppedFrames
      
      // Update timing history if available (only positive values)
      // This updates roughly every time a new image is received
      if (contextStreamStatus.imaging_status?.last_image_elapsed_ms && 
          contextStreamStatus.imaging_status.last_image_elapsed_ms > 0) {
        setImageTimingHistory(prev => {
          const newHistory = [...prev.slice(-19), contextStreamStatus.imaging_status.last_image_elapsed_ms]
          
          // Adjust stack and drop event indices when history shifts
          setStackEventIndices(indices => 
            indices.map(idx => idx - 1).filter(idx => idx >= 0)
          )
          setDropEventIndices(indices => 
            indices.map(idx => idx - 1).filter(idx => idx >= 0)
          )
          
          return newHistory
        })
        
        // Calculate data transfer rate if we have both size and time
        if (contextStreamStatus.imaging_status?.last_image_size_bytes && 
            contextStreamStatus.imaging_status.last_image_size_bytes > 0) {
          // Convert bytes to MB and ms to seconds for MB/s
          const sizeInMB = contextStreamStatus.imaging_status.last_image_size_bytes / (1024 * 1024)
          const timeInSeconds = contextStreamStatus.imaging_status.last_image_elapsed_ms / 1000
          const transferRate = sizeInMB / timeInSeconds
          
          setDataTransferHistory(prev => {
            const newHistory = [...prev.slice(-19), transferRate]
            return newHistory
          })
        }
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
  }, [contextStreamStatus, imageTimingHistory.length])

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
  
  // Update current image elapsed time in real-time
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (localStreamStatus?.imaging_status?.current_image_request_start_time) {
      // Update elapsed time every 100ms
      const updateElapsed = () => {
        // Backend now sends Unix timestamp in milliseconds
        const startTime = localStreamStatus.imaging_status.current_image_request_start_time;
        const elapsed = Date.now() - startTime;
        setCurrentImageElapsed(elapsed);
      };
      
      updateElapsed(); // Initial update
      intervalId = setInterval(updateElapsed, 100);
    } else {
      setCurrentImageElapsed(null);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [localStreamStatus?.imaging_status?.current_image_request_start_time])

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
    <TooltipProvider>
      <div
        ref={overlayRef}
        className={`fixed bg-card/95 backdrop-blur-sm rounded-lg text-sm shadow-xl border-2 border-border ${isMinimized ? 'w-auto' : 'w-80 max-h-[90vh] overflow-y-auto'}`}
        style={{
          left: overlayPosition.x,
          top: overlayPosition.y,
          zIndex: 9999,
          minHeight: isMinimized ? 'auto' : '200px',
          cursor: isDragging ? "grabbing" : "default"
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
              title={isMinimized ? "Expand" : "Minimize"}
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
              onClick={() => setShowStreamStatus(false)}
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
                      <span className="text-muted-foreground">Battery</span>
                    </div>
                    <span className="font-mono">{Math.round(localStreamStatus.status.battery_capacity)}%</span>
                  </div>
                )}

                {/* Temperature */}
                {localStreamStatus?.status?.temp !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Thermometer className={`w-4 h-4 ${localStreamStatus?.status?.temp < 30 ? "text-blue-400" : "text-orange-400"}`} />
                      <span className="text-muted-foreground">Temperature</span>
                    </div>
                    <span className="font-mono">{localStreamStatus.status.temp.toFixed(1)}°C</span>
                  </div>
                )}
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
              {collapsedSections.coordinates ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </h4>

            {!collapsedSections.coordinates && (
              <>
                {/* Altitude */}
                {localStreamStatus?.status?.alt !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      <span className="text-muted-foreground">Altitude</span>
                    </div>
                    <span className="font-mono">{localStreamStatus.status.alt.toFixed(1)}°</span>
                  </div>
                )}

                {/* Azimuth */}
                {localStreamStatus?.status?.az !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-blue-400" />
                      <span className="text-muted-foreground">Azimuth</span>
                    </div>
                    <span className="font-mono">{localStreamStatus.status.az.toFixed(1)}°</span>
                  </div>
                )}

                {/* RA */}
                {localStreamStatus?.status?.ra !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">RA</span>
                      <div className="text-right">
                        <div className="font-mono">{raToHMS(localStreamStatus.status.ra)}</div>
                        <div className="text-muted-foreground text-xs font-mono">{localStreamStatus.status.ra.toFixed(2)}° ({(localStreamStatus.status.ra / 15).toFixed(4)}h)</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dec */}
                {localStreamStatus?.status?.dec !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Dec</span>
                      <div className="text-right">
                        <div className="font-mono">{decToDMS(localStreamStatus.status.dec)}</div>
                        <div className="text-muted-foreground text-xs font-mono">{localStreamStatus.status.dec.toFixed(4)}°</div>
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
                className="text-xs font-semibold uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-foreground"
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
                            <span className="text-muted-foreground">Tilt Angle</span>
                          </div>
                          <span className="font-mono">
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
                              <span className="text-muted-foreground">Rotation</span>
                            </div>
                            <span className="font-mono">
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
                              <span className="text-muted-foreground">Cumulative</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono">
                                {cumulativeRotation.toFixed(1)}°
                              </span>
                              <button
                                onClick={() => {
                                  setCumulativeRotation(0);
                                  previousRotationRef.current = null;
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
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
                        <span className="text-muted-foreground">Pitch</span>
                      </div>
                      <span className="font-mono">{localStreamStatus.status.pitch.toFixed(1)}°</span>
                    </div>
                  )}

                  {/* Roll - fallback if no balance sensor data */}
                  {!localStreamStatus?.status?.balance_sensor?.data && localStreamStatus?.status?.roll !== undefined && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-green-400" />
                        <span className="text-muted-foreground">Roll</span>
                      </div>
                      <span className="font-mono">{localStreamStatus.status.roll.toFixed(1)}°</span>
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
              <div className="flex items-center gap-2">
                Imaging
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-help" onClick={(e) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      The elapsed time shown represents the communication delay between the Seestar telescope and the computer running ESC. 
                      Higher values may indicate that the connection between your Seestar and computer isn't strong enough.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {collapsedSections.imaging ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </h4>

            {!collapsedSections.imaging && (
              <>
                {/* Client Mode / Stage */}
                {localStreamStatus?.status?.stage && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-400" />
                      <span className="text-muted-foreground">Mode</span>
                    </div>
                    <span className="font-mono">
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

                {/* Image Timing */}
                {localStreamStatus?.imaging_status?.last_image_elapsed_ms !== undefined && 
                 localStreamStatus.imaging_status.last_image_elapsed_ms > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-yellow-400" />
                      <span className="text-muted-foreground">Last Image</span>
                    </div>
                    <span className="font-mono">{Math.round(localStreamStatus.imaging_status.last_image_elapsed_ms)}ms</span>
                  </div>
                )}
                
                {/* Current Image Request Timing */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${currentImageElapsed !== null ? 'text-cyan-400 animate-pulse' : 'text-gray-400'}`} />
                    <span className="text-muted-foreground">Current Request</span>
                  </div>
                  <span className={`font-mono ${
                    currentImageElapsed !== null && (() => {
                      const avgTime = localStreamStatus?.imaging_status?.avg_image_elapsed_ms || 1000;
                      return currentImageElapsed > avgTime * 1.5 ? 'text-red-400 font-bold animate-pulse' : '';
                    })()
                  }`}>
                    {currentImageElapsed !== null ? `${Math.round(currentImageElapsed)}ms` : '—'}
                  </span>
                </div>
                
                {/* Data Transfer Rate */}
                {localStreamStatus?.imaging_status?.last_image_size_bytes && 
                 localStreamStatus?.imaging_status?.last_image_elapsed_ms && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-purple-400" />
                      <span className="text-muted-foreground">Transfer Rate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono ${(() => {
                        const sizeInMB = localStreamStatus.imaging_status.last_image_size_bytes / (1024 * 1024);
                        const timeInSeconds = localStreamStatus.imaging_status.last_image_elapsed_ms / 1000;
                        const transferRate = sizeInMB / timeInSeconds;
                        // Flag as slow if less than 1 MB/s
                        if (transferRate < 1.0) {
                          return 'text-red-400';
                        } else if (transferRate < 2.0) {
                          return 'text-yellow-400';
                        }
                        return '';
                      })()}`}>
                        {(() => {
                          const sizeInMB = localStreamStatus.imaging_status.last_image_size_bytes / (1024 * 1024);
                          const timeInSeconds = localStreamStatus.imaging_status.last_image_elapsed_ms / 1000;
                          const transferRate = sizeInMB / timeInSeconds;
                          return `${transferRate.toFixed(2)} MB/s`;
                        })()}
                      </span>
                      {(() => {
                        const sizeInMB = localStreamStatus.imaging_status.last_image_size_bytes / (1024 * 1024);
                        const timeInSeconds = localStreamStatus.imaging_status.last_image_elapsed_ms / 1000;
                        const transferRate = sizeInMB / timeInSeconds;
                        if (transferRate < 1.0) {
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="w-3 h-3 text-red-400" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-sm">
                                  Slow transfer rate detected. This may indicate network issues between your telescope and computer.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                )}
                
                {/* Image Size */}
                {localStreamStatus?.imaging_status?.last_image_size_bytes && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-blue-400" />
                      <span className="text-muted-foreground">Image Size</span>
                    </div>
                    <span className="font-mono">
                      {(() => {
                        const bytes = localStreamStatus.imaging_status.last_image_size_bytes;
                        if (bytes >= 1024 * 1024) {
                          return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
                        } else if (bytes >= 1024) {
                          return `${(bytes / 1024).toFixed(2)} KB`;
                        }
                        return `${bytes} B`;
                      })()}
                    </span>
                  </div>
                )}

                {/* Mini timing graph */}
                {imageTimingHistory.length > 1 && (
                  <div className="h-12 bg-muted rounded p-1 relative">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Stack event markers (green) */}
                      {stackEventIndices.map((index, i) => {
                        const x = (index / (imageTimingHistory.length - 1)) * 100
                        return (
                          <line
                            key={`stack-${i}`}
                            x1={x}
                            y1="0"
                            x2={x}
                            y2="100"
                            stroke="#10b981"
                            strokeWidth="1"
                            strokeOpacity="0.5"
                            strokeDasharray="2,2"
                          />
                        )
                      })}
                      
                      {/* Drop event markers (red) */}
                      {dropEventIndices.map((index, i) => {
                        const x = (index / (imageTimingHistory.length - 1)) * 100
                        return (
                          <line
                            key={`drop-${i}`}
                            x1={x}
                            y1="0"
                            x2={x}
                            y2="100"
                            stroke="#ef4444"
                            strokeWidth="1"
                            strokeOpacity="0.7"
                            strokeDasharray="2,2"
                          />
                        )
                      })}
                      
                      {/* Timing line */}
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
                    
                    {/* Legend */}
                    <div className="absolute top-0 right-0 flex flex-col gap-0.5 text-[9px] bg-background/80 px-1 py-0.5 rounded">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                        <span className="text-muted-foreground">Time</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-0.5 bg-green-400"></div>
                        <span className="text-muted-foreground">Stack</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-0.5 bg-red-400"></div>
                        <span className="text-muted-foreground">Drop</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Data Transfer Rate Graph */}
                {dataTransferHistory.length > 1 && (
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground mb-1">Transfer Rate History</div>
                    <div className="h-12 bg-muted rounded p-1 relative">
                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {/* Threshold lines */}
                        <line
                          x1="0"
                          y1="66.67"  // 1 MB/s threshold (assuming max of 3 MB/s for scale)
                          x2="100"
                          y2="66.67"
                          stroke="#ef4444"
                          strokeWidth="0.5"
                          strokeOpacity="0.3"
                          strokeDasharray="2,2"
                        />
                        <line
                          x1="0"
                          y1="33.33"  // 2 MB/s threshold
                          x2="100"
                          y2="33.33"
                          stroke="#facc15"
                          strokeWidth="0.5"
                          strokeOpacity="0.3"
                          strokeDasharray="2,2"
                        />
                        
                        {/* Transfer rate line */}
                        <polyline
                          fill="none"
                          stroke="#a855f7"
                          strokeWidth="2"
                          points={dataTransferHistory.map((val, i) => {
                            const x = (i / (dataTransferHistory.length - 1)) * 100
                            const maxVal = Math.max(...dataTransferHistory, 3)  // Min scale of 3 MB/s
                            const y = 100 - (val / maxVal) * 100
                            return `${x},${y}`
                          }).join(' ')}
                        />
                      </svg>
                      
                      {/* Scale labels */}
                      <div className="absolute top-0 left-0 text-[9px] text-muted-foreground">
                        {Math.max(...dataTransferHistory, 3).toFixed(1)} MB/s
                      </div>
                      <div className="absolute bottom-0 left-0 text-[9px] text-muted-foreground">
                        0 MB/s
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Network Section */}
          <div className="space-y-2">
            <h4 
              className="text-xs font-semibold uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-foreground"
              onClick={() => toggleSection('network')}
            >
              <div className="flex items-center gap-2">
                Network
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-help" onClick={(e) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      The RTT (Round Trip Time) represents the communication delay between the computer running ESC and your browser. 
                      If you're running a local distribution, this value should be very low. 
                      Otherwise, it will reflect the time across your network connection.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {collapsedSections.network ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </h4>

            {!collapsedSections.network && (
              <>
                {/* Connection Status */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className={`w-4 h-4 ${localStreamStatus?.status?.server_browser_rtt_ms ? "text-green-400" : "text-red-400"}`} />
                    <span className="text-muted-foreground">Status</span>
                  </div>
                  <span className="font-mono">
                    {localStreamStatus?.status?.server_browser_rtt_ms ? "Connected" : "Disconnected"}
                  </span>
                </div>

                {/* RTT */}
                {localStreamStatus?.status?.server_browser_rtt_ms !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Browser RTT</span>
                    <span className="font-mono">{Math.round(localStreamStatus.status.server_browser_rtt_ms)}ms</span>
                  </div>
                )}

                {/* Telescope RTT */}
                {localStreamStatus?.status?.server_telescope_rtt_ms !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Telescope RTT</span>
                    <span className="font-mono">{Math.round(localStreamStatus.status.server_telescope_rtt_ms)}ms</span>
                  </div>
                )}

                {/* Mini RTT graph */}
                {rttHistory.length > 1 && (
                  <div className="h-12 bg-muted rounded p-1">
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
        )}
      </div>
    </TooltipProvider>
  )
}