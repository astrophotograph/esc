"use client"

import { useEffect, useState } from "react"
import { WifiOff, RotateCcw } from "lucide-react"

interface ConnectionLostTestPatternProps {
  isVisible: boolean
  lastConnectionTime?: Date
  onRetry?: () => void
}

export function ConnectionLostTestPattern({ 
  isVisible, 
  lastConnectionTime, 
  onRetry 
}: ConnectionLostTestPatternProps) {
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    if (!isVisible || !lastConnectionTime) return

    const interval = setInterval(() => {
      const now = new Date()
      const elapsed = Math.floor((now.getTime() - lastConnectionTime.getTime()) / 1000)
      setElapsedTime(elapsed)
    }, 1000)

    return () => clearInterval(interval)
  }, [isVisible, lastConnectionTime])

  if (!isVisible) return null

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center z-50">
      {/* Test Pattern Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        {/* Classic TV test pattern elements */}
        <div className="absolute inset-0 opacity-20">
          {/* Color bars at top */}
          <div className="h-16 flex">
            <div className="flex-1 bg-gray-400"></div>
            <div className="flex-1 bg-yellow-400"></div>
            <div className="flex-1 bg-cyan-400"></div>
            <div className="flex-1 bg-green-400"></div>
            <div className="flex-1 bg-purple-400"></div>
            <div className="flex-1 bg-red-400"></div>
            <div className="flex-1 bg-blue-400"></div>
          </div>
          
          {/* Grid pattern */}
          <div className="absolute inset-0 top-16">
            <svg width="100%" height="100%" className="opacity-10">
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Circular test pattern in center */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-64 h-64 rounded-full border-4 border-white opacity-30">
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-2 border-white">
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full border border-white">
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-white"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 text-center text-white">
        {/* Connection Lost Icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <WifiOff className="w-24 h-24 text-red-400" />
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">!</span>
            </div>
          </div>
        </div>

        {/* Please Stand By Text */}
        <div className="mb-8">
          <h1 className="text-6xl font-bold tracking-wider mb-4 font-mono">
            PLEASE STAND BY
          </h1>
          <div className="text-2xl text-gray-300 mb-2">
            Connection to telescope lost
          </div>
          <div className="text-lg text-gray-400">
            Attempting to reconnect...
          </div>
        </div>

        {/* Connection Stats */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-gray-600">
            <div className="text-sm text-gray-400 mb-1">Connection Lost</div>
            <div className="text-xl font-mono text-red-400">
              {formatTime(elapsedTime)} ago
            </div>
          </div>
          
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-gray-600">
            <div className="text-sm text-gray-400 mb-1">Status</div>
            <div className="text-xl font-semibold text-yellow-400">
              Reconnecting
            </div>
          </div>
          
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-gray-600">
            <div className="text-sm text-gray-400 mb-1">Last Seen</div>
            <div className="text-xl font-mono text-gray-300">
              {lastConnectionTime ? lastConnectionTime.toLocaleTimeString() : 'Unknown'}
            </div>
          </div>
        </div>

        {/* Retry Button */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold flex items-center gap-2 mx-auto transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            Retry Connection
          </button>
        )}

        {/* Blinking dots animation */}
        <div className="mt-8 flex justify-center space-x-2">
          <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
          <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse delay-75"></div>
          <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse delay-150"></div>
        </div>
      </div>

      {/* Technical Info Footer */}
      <div className="absolute bottom-8 left-8 text-left text-gray-400 text-sm font-mono">
        <div>TEST PATTERN ACTIVE</div>
        <div>TELESCOPE CONNECTION MONITOR</div>
        <div>AUTOMATIC RECONNECTION ENABLED</div>
      </div>

      {/* Timestamp */}
      <div className="absolute bottom-8 right-8 text-right text-gray-400 text-sm font-mono">
        <div>{new Date().toLocaleString()}</div>
        <div>FRONTEND STATUS: ACTIVE</div>
        <div>BACKEND STATUS: DISCONNECTED</div>
      </div>
    </div>
  )
}