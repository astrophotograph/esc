'use client'

import React from 'react'

interface NeonDialProps {
  value: number
  max: number
  label: string
  unit?: string
  size?: number
  color?: string
  glowIntensity?: number
}

export function NeonDial({ 
  value, 
  max, 
  label, 
  unit = '', 
  size = 120,
  color = 'hsl(var(--primary))',
  glowIntensity = 1
}: NeonDialProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const strokeWidth = size * 0.08
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (circumference * percentage) / 100
  
  // Calculate angle for the value indicator
  const angle = (percentage / 100) * 270 - 135 // Start at -135deg, sweep 270deg
  
  return (
    <div className="relative inline-flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background glow effect */}
        <div 
          className="absolute inset-0 rounded-full neon-pulse"
          style={{
            background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
            filter: `blur(${8 * glowIntensity}px)`,
          }}
        />
        
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          style={{ filter: `drop-shadow(0 0 ${6 * glowIntensity}px ${color})` }}
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`${color}20`}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="5 3"
            className="opacity-50"
          />
          
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
            style={{
              filter: `drop-shadow(0 0 ${4 * glowIntensity}px ${color})`,
            }}
          />
          
          {/* Tick marks */}
          {[...Array(9)].map((_, i) => {
            const tickAngle = -135 + (i * 270) / 8
            const x1 = size / 2 + (radius - 8) * Math.cos(tickAngle * Math.PI / 180)
            const y1 = size / 2 + (radius - 8) * Math.sin(tickAngle * Math.PI / 180)
            const x2 = size / 2 + (radius - 4) * Math.cos(tickAngle * Math.PI / 180)
            const y2 = size / 2 + (radius - 4) * Math.sin(tickAngle * Math.PI / 180)
            
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={1}
                className="opacity-50"
              />
            )
          })}
        </svg>
        
        {/* Center display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div 
            className="text-2xl font-bold tabular-nums neon-text"
            style={{ 
              color,
              textShadow: `
                0 0 10px ${color},
                0 0 20px ${color},
                0 0 30px ${color}
              `
            }}
          >
            {value.toFixed(0)}
          </div>
          {unit && (
            <div 
              className="text-xs opacity-80"
              style={{ color }}
            >
              {unit}
            </div>
          )}
        </div>
        
        {/* Animated indicator dot */}
        <div
          className="absolute w-2 h-2 rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `
              0 0 10px ${color},
              0 0 20px ${color},
              0 0 30px ${color}
            `,
            left: size / 2 + (radius + 10) * Math.cos(angle * Math.PI / 180) - 4,
            top: size / 2 + (radius + 10) * Math.sin(angle * Math.PI / 180) - 4,
            transform: 'rotate(90deg)',
            transition: 'all 0.5s ease-out'
          }}
        />
      </div>
      
      {/* Label */}
      <div 
        className="mt-2 text-xs font-medium uppercase tracking-wider opacity-80"
        style={{ color }}
      >
        {label}
      </div>
    </div>
  )
}

export function NeonDialGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
      {children}
    </div>
  )
}