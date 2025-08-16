"use client"

import { useEffect, useState, useRef } from "react"
import { Focus, Target, Activity, TrendingUp, TrendingDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface AutoFocusOverlayProps {
  focusPosition?: number  // Current focus position from status.focus_position
  isVisible: boolean
}

export function AutoFocusOverlay({
  focusPosition = 0,
  isVisible
}: AutoFocusOverlayProps) {
  const [animationFrame, setAnimationFrame] = useState(0)
  const [pulseScale, setPulseScale] = useState(1)
  const [positionHistory, setPositionHistory] = useState<number[]>([])
  const previousPositionRef = useRef<number | null>(null)
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable')
  const [minPosition, setMinPosition] = useState<number | null>(null)
  const [maxPosition, setMaxPosition] = useState<number | null>(null)

  // Track focus position changes
  useEffect(() => {
    if (focusPosition !== undefined && focusPosition !== null) {
      // Update history
      setPositionHistory(prev => {
        const newHistory = [...prev.slice(-29), focusPosition] // Keep last 30 values
        return newHistory
      })

      // Update min/max
      if (minPosition === null || focusPosition < minPosition) {
        setMinPosition(focusPosition)
      }
      if (maxPosition === null || focusPosition > maxPosition) {
        setMaxPosition(focusPosition)
      }

      // Determine trend
      if (previousPositionRef.current !== null) {
        const diff = focusPosition - previousPositionRef.current
        if (Math.abs(diff) > 0) {
          setTrend(diff > 0 ? 'up' : 'down')
        } else {
          setTrend('stable')
        }
      }
      previousPositionRef.current = focusPosition
    }
  }, [focusPosition, minPosition, maxPosition])

  // Reset tracking when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      setPositionHistory([])
      setMinPosition(null)
      setMaxPosition(null)
      previousPositionRef.current = null
      setTrend('stable')
    }
  }, [isVisible])

  // Animation loop for visual effects
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setAnimationFrame(prev => (prev + 1) % 360)
    }, 50)

    return () => clearInterval(interval)
  }, [isVisible])

  // Pulse animation for the focus icon
  useEffect(() => {
    if (!isVisible) return

    const interval = setInterval(() => {
      setPulseScale(prev => {
        const time = Date.now() / 1000
        return 1 + 0.1 * Math.sin(time * 2 * Math.PI)
      })
    }, 50)

    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible) return null

  // Calculate sparkline points for the position history
  const sparklinePoints = positionHistory.length > 1 
    ? positionHistory.map((value, index) => {
        const x = (index / (positionHistory.length - 1)) * 100
        const range = maxPosition !== null && minPosition !== null 
          ? maxPosition - minPosition 
          : 1
        const y = minPosition !== null && range > 0
          ? 100 - ((value - minPosition) / range) * 100
          : 50
        return `${x},${y}`
      }).join(' ')
    : ''

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 bg-gray-900/95 border-gray-700 shadow-2xl">
        <div className="p-6 space-y-6">
          {/* Header with animated icon */}
          <div className="flex items-center justify-center space-x-3">
            <div className="relative">
              {/* Main icon with scale pulse */}
              <Focus
                className={cn(
                  "w-10 h-10 text-cyan-400",
                  "transition-transform duration-200"
                )}
                style={{ 
                  transform: `scale(${pulseScale}) rotate(${animationFrame / 4}deg)` 
                }}
              />
              {/* Rotating rings */}
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ transform: `rotate(${-animationFrame}deg)` }}
              >
                <Target className="w-12 h-12 text-cyan-300 opacity-30" />
              </div>
              {/* Ping animation */}
              <div className="absolute inset-0 animate-ping">
                <Focus className="w-10 h-10 text-cyan-400 opacity-20" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white">Auto Focus</h2>
          </div>

          {/* Focus Position Display */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-green-400" />
                <span className="text-gray-300">Focus Position:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white font-mono text-2xl">
                  {focusPosition !== undefined ? focusPosition : '---'}
                </span>
                {/* Trend indicator */}
                {trend === 'up' && (
                  <TrendingUp className="w-5 h-5 text-green-400" />
                )}
                {trend === 'down' && (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>

            {/* Min/Max Range */}
            {minPosition !== null && maxPosition !== null && minPosition !== maxPosition && (
              <div className="text-sm text-gray-400 flex justify-between">
                <span>Min: {minPosition}</span>
                <span className="text-cyan-400">Range: {maxPosition - minPosition}</span>
                <span>Max: {maxPosition}</span>
              </div>
            )}
          </div>

          {/* Position History Graph */}
          {positionHistory.length > 1 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-400">Position History</div>
              <div className="h-16 bg-gray-800/50 rounded p-2">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="50" x2="100" y2="50" stroke="#4a5568" strokeWidth="0.5" strokeDasharray="2,2" />
                  <line x1="50" y1="0" x2="50" y2="100" stroke="#4a5568" strokeWidth="0.5" strokeDasharray="2,2" />
                  
                  {/* Sparkline */}
                  <polyline
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    points={sparklinePoints}
                  />
                  
                  {/* Last point indicator */}
                  {positionHistory.length > 0 && (
                    <circle
                      cx="100"
                      cy={minPosition !== null && maxPosition !== null && maxPosition !== minPosition
                        ? 100 - ((positionHistory[positionHistory.length - 1] - minPosition) / (maxPosition - minPosition)) * 100
                        : 50}
                      r="3"
                      fill="#06b6d4"
                      className="animate-pulse"
                    />
                  )}
                </svg>
              </div>
            </div>
          )}

          {/* Visual focus indicator animation */}
          <div className="flex justify-center">
            <div className="relative w-32 h-8">
              {/* Focus scale visualization */}
              <div className="absolute inset-0 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 opacity-30"
                  style={{
                    transform: `translateX(${trend === 'up' ? '10%' : trend === 'down' ? '-10%' : '0%'})`,
                    transition: 'transform 0.3s ease-in-out'
                  }}
                />
              </div>
              
              {/* Moving indicator */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-2 h-6 bg-cyan-400 rounded-full shadow-lg"
                style={{
                  left: `${minPosition !== null && maxPosition !== null && maxPosition !== minPosition && focusPosition !== undefined
                    ? ((focusPosition - minPosition) / (maxPosition - minPosition)) * 100
                    : 50}%`,
                  transform: 'translateX(-50%) translateY(-50%)',
                  transition: 'left 0.3s ease-out'
                }}
              />
            </div>
          </div>

          {/* Loading dots animation */}
          <div className="flex justify-center">
            <div className="flex space-x-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-2 rounded-full",
                    trend === 'stable' ? "bg-yellow-400" : 
                    trend === 'up' ? "bg-green-400" : "bg-red-400",
                    "animate-bounce"
                  )}
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: "1s"
                  }}
                />
              ))}
            </div>
          </div>

          {/* Status message */}
          <div className="text-center text-sm">
            <p className="text-gray-400">
              {trend === 'stable' 
                ? "Finding optimal focus point..."
                : trend === 'up'
                ? "Adjusting focus (increasing)..."
                : "Adjusting focus (decreasing)..."}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Telescope is automatically adjusting focus for sharp images
            </p>
          </div>

          {/* Tips */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-cyan-300">Auto Focus Tips:</p>
              <ul className="space-y-0.5 ml-3">
                <li>• Process may take several minutes</li>
                <li>• Best performed on a bright star</li>
                <li>• Temperature changes may require refocusing</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}