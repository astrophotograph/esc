"use client"

import { useEffect, useRef } from "react"

interface TestPatternProps {
  width?: number
  height?: number
  className?: string
}

export function TestPattern({ width = 800, height = 600, className = "" }: TestPatternProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    canvas.width = width
    canvas.height = height

    // Clear canvas with black background
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, width, height)

    // Draw color bars (similar to SMPTE test pattern)
    const barWidth = width / 7
    const barHeight = height * 0.6
    const colors = [
      "#C0C0C0", // Gray
      "#FFFF00", // Yellow
      "#00FFFF", // Cyan
      "#00FF00", // Green
      "#FF00FF", // Magenta
      "#FF0000", // Red
      "#0000FF", // Blue
    ]

    colors.forEach((color, index) => {
      ctx.fillStyle = color
      ctx.fillRect(index * barWidth, 0, barWidth, barHeight)
    })

    // Draw lower section with smaller bars
    const lowerHeight = height * 0.2
    const lowerY = barHeight
    
    // Blue section
    ctx.fillStyle = "#0000FF"
    ctx.fillRect(0, lowerY, width * 0.25, lowerHeight)
    
    // Black section
    ctx.fillStyle = "#000000"
    ctx.fillRect(width * 0.25, lowerY, width * 0.5, lowerHeight)
    
    // Magenta section
    ctx.fillStyle = "#FF00FF"
    ctx.fillRect(width * 0.75, lowerY, width * 0.25, lowerHeight)

    // Add center crosshairs
    ctx.strokeStyle = "#FFFFFF"
    ctx.lineWidth = 2
    ctx.setLineDash([])
    
    // Horizontal line
    ctx.beginPath()
    ctx.moveTo(width * 0.4, height * 0.5)
    ctx.lineTo(width * 0.6, height * 0.5)
    ctx.stroke()
    
    // Vertical line
    ctx.beginPath()
    ctx.moveTo(width * 0.5, height * 0.4)
    ctx.lineTo(width * 0.5, height * 0.6)
    ctx.stroke()

    // Add corner registration marks
    const markSize = 20
    const markOffset = 10
    
    // Top-left
    ctx.beginPath()
    ctx.moveTo(markOffset, markOffset)
    ctx.lineTo(markOffset + markSize, markOffset)
    ctx.moveTo(markOffset, markOffset)
    ctx.lineTo(markOffset, markOffset + markSize)
    ctx.stroke()
    
    // Top-right
    ctx.beginPath()
    ctx.moveTo(width - markOffset, markOffset)
    ctx.lineTo(width - markOffset - markSize, markOffset)
    ctx.moveTo(width - markOffset, markOffset)
    ctx.lineTo(width - markOffset, markOffset + markSize)
    ctx.stroke()
    
    // Bottom-left
    ctx.beginPath()
    ctx.moveTo(markOffset, height - markOffset)
    ctx.lineTo(markOffset + markSize, height - markOffset)
    ctx.moveTo(markOffset, height - markOffset)
    ctx.lineTo(markOffset, height - markOffset - markSize)
    ctx.stroke()
    
    // Bottom-right
    ctx.beginPath()
    ctx.moveTo(width - markOffset, height - markOffset)
    ctx.lineTo(width - markOffset - markSize, height - markOffset)
    ctx.moveTo(width - markOffset, height - markOffset)
    ctx.lineTo(width - markOffset, height - markOffset - markSize)
    ctx.stroke()

    // Add "PLEASE STAND BY" text
    ctx.fillStyle = "#FFFFFF"
    ctx.font = "bold 48px Arial, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    
    // Add text shadow for better visibility
    ctx.shadowColor = "#000000"
    ctx.shadowBlur = 4
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    
    ctx.fillText("PLEASE STAND BY", width * 0.5, height * 0.85)
    
    // Add smaller subtitle
    ctx.font = "24px Arial, sans-serif"
    ctx.fillText("Connection Lost - Attempting to Reconnect", width * 0.5, height * 0.92)

    // Reset shadow
    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

  }, [width, height])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full object-contain ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  )
}