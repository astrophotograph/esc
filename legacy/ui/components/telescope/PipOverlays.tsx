"use client"
import { useTelescopeContext } from "../../context/TelescopeContext"

interface PipOverlaysProps {
  width: number
  height: number
  camera: "allsky" | "guide" | "finder"
}

export function PipOverlays({ width, height, camera }: PipOverlaysProps) {
  const { pipOverlaySettings } = useTelescopeContext()

  const centerX = width / 2
  const centerY = height / 2

  return (
    <>
      {/* CSS Animations */}
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
        
        @keyframes compassSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes compassPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
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
          transform-origin: ${centerX}px ${centerY}px;
        }
        
        .compass-spin {
          animation: compassSpin 30s linear infinite;
          transform-origin: ${width - 40}px 40px;
        }
        
        .compass-pulse {
          animation: compassPulse 2.5s ease-in-out infinite;
        }
        
        .grid-shimmer {
          animation: gridShimmer 4s ease-in-out infinite;
        }
        
        .scale-blink {
          animation: scaleBarBlink 3s ease-in-out infinite;
        }
      `}</style>

      <svg className="absolute inset-0 pointer-events-none" width={width} height={height} style={{ zIndex: 10 }}>
        {/* Grid Overlay with shimmer animation */}
        {pipOverlaySettings.grid.enabled && (
          <g opacity={pipOverlaySettings.grid.opacity} className="grid-shimmer">
            {pipOverlaySettings.grid.style === "lines" ? (
              <>
                {/* Vertical lines */}
                {Array.from({ length: Math.ceil(width / pipOverlaySettings.grid.spacing) + 1 }, (_, i) => (
                  <line
                    key={`v-${i}`}
                    x1={i * pipOverlaySettings.grid.spacing}
                    y1={0}
                    x2={i * pipOverlaySettings.grid.spacing}
                    y2={height}
                    stroke={pipOverlaySettings.grid.color}
                    strokeWidth={1}
                  />
                ))}
                {/* Horizontal lines */}
                {Array.from({ length: Math.ceil(height / pipOverlaySettings.grid.spacing) + 1 }, (_, i) => (
                  <line
                    key={`h-${i}`}
                    x1={0}
                    y1={i * pipOverlaySettings.grid.spacing}
                    x2={width}
                    y2={i * pipOverlaySettings.grid.spacing}
                    stroke={pipOverlaySettings.grid.color}
                    strokeWidth={1}
                  />
                ))}
              </>
            ) : (
              /* Grid dots with shimmer */
              Array.from({ length: Math.ceil(width / pipOverlaySettings.grid.spacing) + 1 }, (_, i) =>
                Array.from({ length: Math.ceil(height / pipOverlaySettings.grid.spacing) + 1 }, (_, j) => (
                  <circle
                    key={`dot-${i}-${j}`}
                    cx={i * pipOverlaySettings.grid.spacing}
                    cy={j * pipOverlaySettings.grid.spacing}
                    r={1.5}
                    fill={pipOverlaySettings.grid.color}
                  />
                )),
              ).flat()
            )}
          </g>
        )}

        {/* Crosshairs Overlay with animations */}
        {pipOverlaySettings.crosshairs.enabled && (
          <g>
            {pipOverlaySettings.crosshairs.style === "simple" && (
              <>
                {/* Vertical crosshair with glow */}
                <line
                  x1={centerX}
                  y1={0}
                  x2={centerX}
                  y2={height}
                  stroke={pipOverlaySettings.crosshairs.color}
                  strokeWidth={pipOverlaySettings.crosshairs.thickness}
                  opacity={0.8}
                  className="crosshair-glow"
                />
                {/* Horizontal crosshair with glow */}
                <line
                  x1={0}
                  y1={centerY}
                  x2={width}
                  y2={centerY}
                  stroke={pipOverlaySettings.crosshairs.color}
                  strokeWidth={pipOverlaySettings.crosshairs.thickness}
                  opacity={0.8}
                  className="crosshair-glow"
                />
                {/* Center dot with pulse */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={3}
                  fill={pipOverlaySettings.crosshairs.color}
                  className="crosshair-pulse"
                />
              </>
            )}

            {pipOverlaySettings.crosshairs.style === "circle" && (
              <>
                {/* Center circle with pulse */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={20}
                  fill="none"
                  stroke={pipOverlaySettings.crosshairs.color}
                  strokeWidth={pipOverlaySettings.crosshairs.thickness}
                  opacity={0.8}
                  className="crosshair-pulse"
                />
                {/* Center dot with stronger pulse */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={3}
                  fill={pipOverlaySettings.crosshairs.color}
                  className="crosshair-pulse"
                />
                {/* Crosshair lines with glow */}
                <g className="crosshair-glow">
                  <line
                    x1={centerX - 30}
                    y1={centerY}
                    x2={centerX - 25}
                    y2={centerY}
                    stroke={pipOverlaySettings.crosshairs.color}
                    strokeWidth={pipOverlaySettings.crosshairs.thickness}
                    opacity={0.8}
                  />
                  <line
                    x1={centerX + 25}
                    y1={centerY}
                    x2={centerX + 30}
                    y2={centerY}
                    stroke={pipOverlaySettings.crosshairs.color}
                    strokeWidth={pipOverlaySettings.crosshairs.thickness}
                    opacity={0.8}
                  />
                  <line
                    x1={centerX}
                    y1={centerY - 30}
                    x2={centerX}
                    y2={centerY - 25}
                    stroke={pipOverlaySettings.crosshairs.color}
                    strokeWidth={pipOverlaySettings.crosshairs.thickness}
                    opacity={0.8}
                  />
                  <line
                    x1={centerX}
                    y1={centerY + 25}
                    x2={centerX}
                    y2={centerY + 30}
                    stroke={pipOverlaySettings.crosshairs.color}
                    strokeWidth={pipOverlaySettings.crosshairs.thickness}
                    opacity={0.8}
                  />
                </g>
              </>
            )}

            {pipOverlaySettings.crosshairs.style === "target" && (
              <>
                {/* Outer circle with slow rotation */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={40}
                  fill="none"
                  stroke={pipOverlaySettings.crosshairs.color}
                  strokeWidth={pipOverlaySettings.crosshairs.thickness}
                  opacity={0.6}
                  className="target-rotate"
                />
                {/* Inner circle with pulse */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={20}
                  fill="none"
                  stroke={pipOverlaySettings.crosshairs.color}
                  strokeWidth={pipOverlaySettings.crosshairs.thickness}
                  opacity={0.8}
                  className="crosshair-pulse"
                />
                {/* Center dot with strong pulse */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={4}
                  fill={pipOverlaySettings.crosshairs.color}
                  className="crosshair-pulse"
                />
                {/* Target lines with rotation */}
                <g className="target-rotate">
                  {[0, 90, 180, 270].map((angle) => {
                    const rad = (angle * Math.PI) / 180
                    const x1 = centerX + Math.cos(rad) * 25
                    const y1 = centerY + Math.sin(rad) * 25
                    const x2 = centerX + Math.cos(rad) * 35
                    const y2 = centerY + Math.sin(rad) * 35
                    return (
                      <line
                        key={angle}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={pipOverlaySettings.crosshairs.color}
                        strokeWidth={pipOverlaySettings.crosshairs.thickness}
                        opacity={0.8}
                      />
                    )
                  })}
                </g>
              </>
            )}
          </g>
        )}

        {/* Compass Overlay with animations */}
        {pipOverlaySettings.compass.enabled && (
          <g>
            {/* Compass circle with pulse */}
            <circle
              cx={width - 40}
              cy={40}
              r={25}
              fill="rgba(0,0,0,0.3)"
              stroke={pipOverlaySettings.compass.color}
              strokeWidth={2}
              className="compass-pulse"
            />

            {/* North indicator with spin animation */}
            <g className="compass-spin">
              <line
                x1={width - 40}
                y1={20}
                x2={width - 40}
                y2={30}
                stroke={pipOverlaySettings.compass.color}
                strokeWidth={3}
                markerEnd="url(#arrowhead)"
              />

              {/* Additional compass needle for better visibility */}
              <line
                x1={width - 40}
                y1={50}
                x2={width - 40}
                y2={55}
                stroke={pipOverlaySettings.compass.color}
                strokeWidth={2}
                opacity={0.6}
              />
            </g>

            {pipOverlaySettings.compass.showCardinals && (
              <g className="crosshair-pulse">
                <text
                  x={width - 40}
                  y={18}
                  textAnchor="middle"
                  fill={pipOverlaySettings.compass.color}
                  fontSize="10"
                  fontWeight="bold"
                >
                  N
                </text>
                <text x={width - 15} y={45} textAnchor="middle" fill={pipOverlaySettings.compass.color} fontSize="8">
                  E
                </text>
                <text x={width - 40} y={68} textAnchor="middle" fill={pipOverlaySettings.compass.color} fontSize="8">
                  S
                </text>
                <text x={width - 65} y={45} textAnchor="middle" fill={pipOverlaySettings.compass.color} fontSize="8">
                  W
                </text>
              </g>
            )}

            {pipOverlaySettings.compass.showDegrees && (
              <g className="crosshair-pulse">
                <text
                  x={width - 40}
                  y={75}
                  textAnchor="middle"
                  fill={pipOverlaySettings.compass.color}
                  fontSize="8"
                  fontFamily="monospace"
                >
                  0°
                </text>
              </g>
            )}

            {/* Arrow marker definition with glow */}
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={pipOverlaySettings.compass.color} />
              </marker>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </g>
        )}

        {/* Measurement Scale with blink animation */}
        {pipOverlaySettings.measurements.enabled && pipOverlaySettings.measurements.showScale && (
          <g className="scale-blink">
            {/* Scale bar background */}
            <rect x={10} y={height - 40} width={100} height={20} fill="rgba(0,0,0,0.5)" rx={3} />

            {/* Scale bar */}
            <line
              x1={15}
              y1={height - 25}
              x2={85}
              y2={height - 25}
              stroke={pipOverlaySettings.measurements.color}
              strokeWidth={2}
            />

            {/* Scale markers */}
            <line
              x1={15}
              y1={height - 30}
              x2={15}
              y2={height - 20}
              stroke={pipOverlaySettings.measurements.color}
              strokeWidth={2}
            />
            <line
              x1={85}
              y1={height - 30}
              x2={85}
              y2={height - 20}
              stroke={pipOverlaySettings.measurements.color}
              strokeWidth={2}
            />

            {/* Scale text */}
            <text
              x={50}
              y={height - 15}
              textAnchor="middle"
              fill={pipOverlaySettings.measurements.color}
              fontSize="10"
              fontWeight="bold"
            >
              {camera === "allsky" ? "30°" : camera === "guide" ? "5'" : "2°"}
            </text>
          </g>
        )}

        {/* Coordinate Display with pulse */}
        {pipOverlaySettings.measurements.enabled && pipOverlaySettings.measurements.showCoordinates && (
          <g className="crosshair-pulse">
            <rect x={width - 120} y={height - 40} width={110} height={30} fill="rgba(0,0,0,0.7)" rx={3} />
            <text
              x={width - 115}
              y={height - 25}
              fill={pipOverlaySettings.measurements.color}
              fontSize="9"
              fontFamily="monospace"
            >
              RA: {camera === "allsky" ? "20h 15m 30s" : camera === "guide" ? "20h 15m 32s" : "20h 15m 28s"}
            </text>
            <text
              x={width - 115}
              y={height - 15}
              fill={pipOverlaySettings.measurements.color}
              fontSize="9"
              fontFamily="monospace"
            >
              Dec: {camera === "allsky" ? "+42° 18' 45\"" : camera === "guide" ? "+42° 18' 47\"" : "+42° 18' 43\""}
            </text>
          </g>
        )}
      </svg>
    </>
  )
}
