import { useEffect, useState } from 'react'

export interface OverlaySettings {
  crosshairs: {
    enabled: boolean
    style: 'simple' | 'circle' | 'target'
    color: string
    thickness: number
    opacity: number
  }
  grid: {
    enabled: boolean
    style: 'lines' | 'dots'
    spacing: number
    color: string
    opacity: number
  }
  compass: {
    enabled: boolean
    color: string
    showCardinals: boolean
    showDegrees: boolean
  }
  measurements: {
    enabled: boolean
    color: string
    showScale: boolean
    showCoordinates: boolean
  }
}

interface VideoOverlaysProps {
  width: number
  height: number
  settings: OverlaySettings
}

export function VideoOverlays({ width, height, settings }: VideoOverlaysProps) {
  const [rotation, setRotation] = useState(0)

  // Rotate compass slowly
  useEffect(() => {
    const interval = setInterval(() => {
      setRotation(prev => (prev + 0.5) % 360)
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const centerX = width / 2
  const centerY = height / 2

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* @ts-expect-error styled-jsx syntax */}
      <style jsx>{`
        @keyframes crosshairPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        @keyframes crosshairGlow {
          0%, 100% { filter: drop-shadow(0 0 2px currentColor); }
          50% { filter: drop-shadow(0 0 6px currentColor); }
        }

        @keyframes targetRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes gridShimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }

        @keyframes scaleBarBlink {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }

        .crosshair-pulse {
          animation: crosshairPulse 2s ease-in-out infinite;
        }

        .crosshair-glow {
          animation: crosshairGlow 3s ease-in-out infinite;
        }

        .target-rotate {
          animation: targetRotate 20s linear infinite;
        }

        .grid-shimmer {
          animation: gridShimmer 4s ease-in-out infinite;
        }

        .scale-blink {
          animation: scaleBarBlink 3s ease-in-out infinite;
        }
      `}</style>

      <svg className="absolute inset-0" width={width} height={height} style={{ zIndex: 10 }}>
        {/* Grid Overlay */}
        {settings.grid.enabled && (
          <g opacity={settings.grid.opacity} className="grid-shimmer">
            {settings.grid.style === 'lines' ? (
              <>
                {/* Vertical lines */}
                {Array.from({ length: Math.ceil(width / settings.grid.spacing) + 1 }, (_, i) => (
                  <line
                    key={`v-${i}`}
                    x1={i * settings.grid.spacing}
                    y1={0}
                    x2={i * settings.grid.spacing}
                    y2={height}
                    stroke={settings.grid.color}
                    strokeWidth={1}
                  />
                ))}
                {/* Horizontal lines */}
                {Array.from({ length: Math.ceil(height / settings.grid.spacing) + 1 }, (_, i) => (
                  <line
                    key={`h-${i}`}
                    x1={0}
                    y1={i * settings.grid.spacing}
                    x2={width}
                    y2={i * settings.grid.spacing}
                    stroke={settings.grid.color}
                    strokeWidth={1}
                  />
                ))}
              </>
            ) : (
              /* Grid dots */
              Array.from({ length: Math.ceil(width / settings.grid.spacing) + 1 }, (_, i) =>
                Array.from({ length: Math.ceil(height / settings.grid.spacing) + 1 }, (_, j) => (
                  <circle
                    key={`dot-${i}-${j}`}
                    cx={i * settings.grid.spacing}
                    cy={j * settings.grid.spacing}
                    r={1.5}
                    fill={settings.grid.color}
                  />
                )),
              ).flat()
            )}
          </g>
        )}

        {/* Crosshairs Overlay */}
        {settings.crosshairs.enabled && (
          <g opacity={settings.crosshairs.opacity}>
            {settings.crosshairs.style === 'simple' && (
              <>
                <line
                  x1={centerX}
                  y1={0}
                  x2={centerX}
                  y2={height}
                  stroke={settings.crosshairs.color}
                  strokeWidth={settings.crosshairs.thickness}
                  className="crosshair-glow"
                />
                <line
                  x1={0}
                  y1={centerY}
                  x2={width}
                  y2={centerY}
                  stroke={settings.crosshairs.color}
                  strokeWidth={settings.crosshairs.thickness}
                  className="crosshair-glow"
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={3}
                  fill={settings.crosshairs.color}
                  className="crosshair-pulse"
                />
              </>
            )}

            {settings.crosshairs.style === 'circle' && (
              <>
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={20}
                  fill="none"
                  stroke={settings.crosshairs.color}
                  strokeWidth={settings.crosshairs.thickness}
                  className="crosshair-pulse"
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={3}
                  fill={settings.crosshairs.color}
                  className="crosshair-pulse"
                />
                <g className="crosshair-glow">
                  <line x1={centerX - 30} y1={centerY} x2={centerX - 25} y2={centerY} stroke={settings.crosshairs.color} strokeWidth={settings.crosshairs.thickness} />
                  <line x1={centerX + 25} y1={centerY} x2={centerX + 30} y2={centerY} stroke={settings.crosshairs.color} strokeWidth={settings.crosshairs.thickness} />
                  <line x1={centerX} y1={centerY - 30} x2={centerX} y2={centerY - 25} stroke={settings.crosshairs.color} strokeWidth={settings.crosshairs.thickness} />
                  <line x1={centerX} y1={centerY + 25} x2={centerX} y2={centerY + 30} stroke={settings.crosshairs.color} strokeWidth={settings.crosshairs.thickness} />
                </g>
              </>
            )}

            {settings.crosshairs.style === 'target' && (
              <>
                <circle cx={centerX} cy={centerY} r={40} fill="none" stroke={settings.crosshairs.color} strokeWidth={settings.crosshairs.thickness} opacity={0.6} className="target-rotate" style={{ transformOrigin: `${centerX}px ${centerY}px` }} />
                <circle cx={centerX} cy={centerY} r={20} fill="none" stroke={settings.crosshairs.color} strokeWidth={settings.crosshairs.thickness} className="crosshair-pulse" />
                <circle cx={centerX} cy={centerY} r={4} fill={settings.crosshairs.color} className="crosshair-pulse" />
                <g className="target-rotate" style={{ transformOrigin: `${centerX}px ${centerY}px` }}>
                  {[0, 90, 180, 270].map((angle) => {
                    const rad = (angle * Math.PI) / 180
                    const x1 = centerX + Math.cos(rad) * 25
                    const y1 = centerY + Math.sin(rad) * 25
                    const x2 = centerX + Math.cos(rad) * 35
                    const y2 = centerY + Math.sin(rad) * 35
                    return (
                      <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={settings.crosshairs.color} strokeWidth={settings.crosshairs.thickness} opacity={0.8} />
                    )
                  })}
                </g>
              </>
            )}
          </g>
        )}

        {/* Compass Overlay */}
        {settings.compass.enabled && (
          <g>
            <circle cx={width - 40} cy={40} r={25} fill="rgba(0,0,0,0.3)" stroke={settings.compass.color} strokeWidth={2} opacity={0.7} />

            <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${width - 40}px 40px` }}>
              <line x1={width - 40} y1={20} x2={width - 40} y2={30} stroke={settings.compass.color} strokeWidth={3} markerEnd="url(#arrowhead)" />
              <line x1={width - 40} y1={50} x2={width - 40} y2={55} stroke={settings.compass.color} strokeWidth={2} opacity={0.6} />
            </g>

            {settings.compass.showCardinals && (
              <g className="crosshair-pulse">
                <text x={width - 40} y={18} textAnchor="middle" fill={settings.compass.color} fontSize="10" fontWeight="bold">N</text>
                <text x={width - 15} y={45} textAnchor="middle" fill={settings.compass.color} fontSize="8">E</text>
                <text x={width - 40} y={68} textAnchor="middle" fill={settings.compass.color} fontSize="8">S</text>
                <text x={width - 65} y={45} textAnchor="middle" fill={settings.compass.color} fontSize="8">W</text>
              </g>
            )}

            {settings.compass.showDegrees && (
              <text x={width - 40} y={75} textAnchor="middle" fill={settings.compass.color} fontSize="8" fontFamily="monospace" className="crosshair-pulse">{Math.round(rotation)}°</text>
            )}

            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={settings.compass.color} />
              </marker>
            </defs>
          </g>
        )}

        {/* Measurement Scale */}
        {settings.measurements.enabled && settings.measurements.showScale && (
          <g className="scale-blink">
            <rect x={10} y={height - 40} width={100} height={20} fill="rgba(0,0,0,0.5)" rx={3} />
            <line x1={15} y1={height - 25} x2={85} y2={height - 25} stroke={settings.measurements.color} strokeWidth={2} />
            <line x1={15} y1={height - 30} x2={15} y2={height - 20} stroke={settings.measurements.color} strokeWidth={2} />
            <line x1={85} y1={height - 30} x2={85} y2={height - 20} stroke={settings.measurements.color} strokeWidth={2} />
            <text x={50} y={height - 15} textAnchor="middle" fill={settings.measurements.color} fontSize="10" fontWeight="bold">30°</text>
          </g>
        )}

        {/* Coordinates Display */}
        {settings.measurements.enabled && settings.measurements.showCoordinates && (
          <g className="crosshair-pulse">
            <rect x={width - 120} y={height - 40} width={110} height={30} fill="rgba(0,0,0,0.7)" rx={3} />
            <text x={width - 115} y={height - 25} fill={settings.measurements.color} fontSize="9" fontFamily="monospace">RA: 20h 15m 30s</text>
            <text x={width - 115} y={height - 15} fill={settings.measurements.color} fontSize="9" fontFamily="monospace">Dec: +42° 18&apos; 45&quot;</text>
          </g>
        )}
      </svg>
    </div>
  )
}

export const defaultOverlaySettings: OverlaySettings = {
  crosshairs: {
    enabled: false,
    style: 'simple',
    color: '#FF0000',
    thickness: 2,
    opacity: 0.8
  },
  grid: {
    enabled: false,
    style: 'lines',
    spacing: 50,
    color: '#00FF00',
    opacity: 0.3
  },
  compass: {
    enabled: false,
    color: '#00FFFF',
    showCardinals: true,
    showDegrees: true
  },
  measurements: {
    enabled: false,
    color: '#FFFF00',
    showScale: true,
    showCoordinates: true
  }
}
