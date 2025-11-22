"use client"

import { useEffect, useState } from "react"

interface VintageColorTestPatternProps {
  width?: number
  height?: number
  className?: string
  statusText?: string
}

export function VintageColorTestPattern({ 
  width = 800, 
  height = 600, 
  className = "", 
  statusText 
}: VintageColorTestPatternProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={`bg-black flex items-center justify-center overflow-hidden ${className}`} style={{ width, height }}>
      <div className="relative w-full h-full bg-gray-900 border-8 border-gray-800 rounded-lg shadow-2xl">
        {/* Static noise overlay */}
        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxwYXR0ZXJuIGlkPSJub2lzZSIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjEiLz4KICAgICAgPHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuMSIvPgogICAgPC9wYXR0ZXJuPgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0idXJsKCNub2lzZSkiLz4KPC9zdmc+')] animate-pulse"></div>

        {/* Main content */}
        <div className="relative w-full h-full">
          {/* Top section with color bars */}
          <div className="h-1/3 flex">
            <div className="flex-1 bg-white"></div>
            <div className="flex-1 bg-yellow-400"></div>
            <div className="flex-1 bg-cyan-400"></div>
            <div className="flex-1 bg-green-400"></div>
            <div className="flex-1 bg-purple-500"></div>
            <div className="flex-1 bg-red-500"></div>
            <div className="flex-1 bg-blue-500"></div>
          </div>

          {/* Middle section with geometric patterns */}
          <div className="h-1/3 bg-gray-700 relative flex items-center justify-center">
            {/* Concentric circles */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 border-4 border-white rounded-full opacity-80"></div>
              <div className="absolute w-48 h-48 border-2 border-white rounded-full opacity-60"></div>
              <div className="absolute w-32 h-32 border-2 border-white rounded-full opacity-40"></div>
              <div className="absolute w-16 h-16 border-2 border-white rounded-full opacity-20"></div>
              <div className="absolute w-4 h-4 bg-white rounded-full"></div>
            </div>

            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-20">
              <svg className="w-full h-full" viewBox="0 0 400 300">
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            {/* Corner markers */}
            <div className="absolute top-4 left-4 w-8 h-8 border-2 border-white"></div>
            <div className="absolute top-4 right-4 w-8 h-8 border-2 border-white"></div>
            <div className="absolute bottom-4 left-4 w-8 h-8 border-2 border-white"></div>
            <div className="absolute bottom-4 right-4 w-8 h-8 border-2 border-white"></div>
          </div>

          {/* Bottom section with technical info */}
          <div className="h-1/3 bg-black text-white flex">
            {/* Left side - grayscale bars */}
            <div className="w-1/4 flex flex-col">
              <div className="flex-1 bg-white"></div>
              <div className="flex-1 bg-gray-200"></div>
              <div className="flex-1 bg-gray-400"></div>
              <div className="flex-1 bg-gray-600"></div>
              <div className="flex-1 bg-gray-800"></div>
              <div className="flex-1 bg-black"></div>
            </div>

            {/* Center - technical information */}
            <div className="flex-1 flex flex-col justify-center items-center space-y-4 font-mono">
              <div className="text-2xl font-bold tracking-wider">TEST PATTERN</div>
              <div className="text-lg">NTSC COLOR BARS</div>
              <div className="text-sm opacity-80">525 LINES • 60Hz</div>
              <div className="text-sm opacity-80">ASPECT RATIO 4:3</div>
              <div className="text-xs opacity-60 mt-4">{time.toLocaleTimeString()}</div>
              <div className="text-xs opacity-60">{time.toLocaleDateString()}</div>
            </div>

            {/* Right side - frequency bars */}
            <div className="w-1/4 flex">
              <div className="flex-1 bg-red-600"></div>
              <div className="flex-1 bg-green-600"></div>
              <div className="flex-1 bg-blue-600"></div>
              <div className="flex-1 bg-white"></div>
            </div>
          </div>

          {/* Station identification */}
          <div className="absolute top-8 left-8 text-white font-mono text-sm opacity-80">
            <div>STATION ID: VTST-1</div>
            <div>FREQUENCY: 525.25 MHz</div>
          </div>

          {/* Technical specs */}
          <div className="absolute top-8 right-8 text-white font-mono text-xs opacity-60 text-right">
            <div>VIDEO: 1.25V p-p</div>
            <div>SYNC: -40 IRE</div>
            <div>BLANKING: 0 IRE</div>
            <div>WHITE: +100 IRE</div>
          </div>

          {/* Bottom identification */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-white font-mono text-xs opacity-60">
            SMPTE COLOR BARS • EIA RS-189-A STANDARD
          </div>

          {/* Status text overlay */}
          {statusText && (
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded font-mono text-sm">
              {statusText}
            </div>
          )}
        </div>

        {/* Scanlines effect */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="w-full h-full bg-gradient-to-b from-transparent via-black to-transparent opacity-5 bg-[length:100%_4px] bg-repeat-y animate-pulse"></div>
        </div>
      </div>
    </div>
  )
}
