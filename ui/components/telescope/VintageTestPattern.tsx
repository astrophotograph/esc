"use client"

import { useEffect, useRef } from "react"

interface VintageTestPatternProps {
  width?: number
  height?: number
  className?: string
}

export function VintageTestPattern({ width = 800, height = 600, className = "" }: VintageTestPatternProps) {
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

    // Draw vintage monoscope pattern background
    ctx.fillStyle = "#404040"
    ctx.fillRect(0, 0, width, height)

    // Draw center circle (like old TV test patterns)
    const centerX = width / 2
    const centerY = height / 2
    const maxRadius = Math.min(width, height) * 0.4

    // Outer circle
    ctx.strokeStyle = "#FFFFFF"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI)
    ctx.stroke()

    // Inner circles (bullseye pattern)
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath()
      ctx.arc(centerX, centerY, (maxRadius * i) / 5, 0, 2 * Math.PI)
      ctx.stroke()
    }

    // Draw crosshairs
    ctx.lineWidth = 2
    ctx.beginPath()
    // Horizontal line
    ctx.moveTo(centerX - maxRadius * 1.2, centerY)
    ctx.lineTo(centerX + maxRadius * 1.2, centerY)
    // Vertical line
    ctx.moveTo(centerX, centerY - maxRadius * 1.2)
    ctx.lineTo(centerX, centerY + maxRadius * 1.2)
    ctx.stroke()

    // Draw corner resolution charts (like vintage TV patterns)
    const cornerSize = 60
    const cornerOffset = 40

    // Top-left corner pattern
    drawResolutionChart(ctx, cornerOffset, cornerOffset, cornerSize)
    // Top-right corner pattern
    drawResolutionChart(ctx, width - cornerOffset - cornerSize, cornerOffset, cornerSize)
    // Bottom-left corner pattern
    drawResolutionChart(ctx, cornerOffset, height - cornerOffset - cornerSize, cornerSize)
    // Bottom-right corner pattern
    drawResolutionChart(ctx, width - cornerOffset - cornerSize, height - cornerOffset - cornerSize, cornerSize)

    // Draw frequency bars on the sides (like old test patterns)
    drawFrequencyBars(ctx, 20, height * 0.25, 30, height * 0.5, true) // Left side
    drawFrequencyBars(ctx, width - 50, height * 0.25, 30, height * 0.5, true) // Right side
    
    // Draw geometric patterns in corners
    drawGeometricPattern(ctx, centerX - maxRadius * 0.7, centerY - maxRadius * 0.7, 40)
    drawGeometricPattern(ctx, centerX + maxRadius * 0.7, centerY - maxRadius * 0.7, 40)
    drawGeometricPattern(ctx, centerX - maxRadius * 0.7, centerY + maxRadius * 0.7, 40)
    drawGeometricPattern(ctx, centerX + maxRadius * 0.7, centerY + maxRadius * 0.7, 40)

    // Add vintage-style text
    ctx.fillStyle = "#FFFFFF"
    ctx.font = "bold 36px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    
    // Add text shadow for better visibility
    ctx.shadowColor = "#000000"
    ctx.shadowBlur = 3
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    
    ctx.fillText("PLEASE STAND BY", centerX, height * 0.8)
    
    // Add smaller subtitle in vintage style
    ctx.font = "20px monospace"
    ctx.fillText("• TELESCOPE SIGNAL INTERRUPTED •", centerX, height * 0.87)
    
    // Add technical info like old test patterns
    ctx.font = "14px monospace"
    ctx.textAlign = "left"
    ctx.fillText("RESOLUTION: 1920×1080", 20, height - 60)
    ctx.fillText("ASPECT: 16:9", 20, height - 40)
    ctx.fillText("PATTERN: MONOSCOPE", 20, height - 20)
    
    ctx.textAlign = "right"
    ctx.fillText("TECHNICAL DIFFICULTIES", width - 20, height - 60)
    ctx.fillText("RECONNECTING...", width - 20, height - 40)
    const currentTime = new Date().toLocaleTimeString()
    ctx.fillText(`TIME: ${currentTime}`, width - 20, height - 20)

    // Reset shadow
    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

  }, [width, height])

  // Helper function to draw resolution test charts
  function drawResolutionChart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.strokeStyle = "#FFFFFF"
    ctx.lineWidth = 1
    
    // Draw grid pattern
    const gridSize = size / 8
    for (let i = 0; i <= 8; i++) {
      // Horizontal lines
      ctx.beginPath()
      ctx.moveTo(x, y + i * gridSize)
      ctx.lineTo(x + size, y + i * gridSize)
      ctx.stroke()
      
      // Vertical lines
      ctx.beginPath()
      ctx.moveTo(x + i * gridSize, y)
      ctx.lineTo(x + i * gridSize, y + size)
      ctx.stroke()
    }
  }

  // Helper function to draw frequency bars
  function drawFrequencyBars(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, vertical: boolean) {
    ctx.fillStyle = "#FFFFFF"
    
    const barCount = 10
    const barHeight = height / barCount
    
    for (let i = 0; i < barCount; i++) {
      const alpha = (i + 1) / barCount
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      
      if (vertical) {
        ctx.fillRect(x, y + i * barHeight, width, barHeight)
      } else {
        ctx.fillRect(x + i * (width / barCount), y, width / barCount, height)
      }
    }
  }

  // Helper function to draw geometric patterns
  function drawGeometricPattern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.strokeStyle = "#FFFFFF"
    ctx.lineWidth = 1
    
    // Draw diamond pattern
    ctx.beginPath()
    ctx.moveTo(x + size / 2, y)
    ctx.lineTo(x + size, y + size / 2)
    ctx.lineTo(x + size / 2, y + size)
    ctx.lineTo(x, y + size / 2)
    ctx.closePath()
    ctx.stroke()
    
    // Inner diamond
    const innerSize = size * 0.6
    const offset = (size - innerSize) / 2
    ctx.beginPath()
    ctx.moveTo(x + offset + innerSize / 2, y + offset)
    ctx.lineTo(x + offset + innerSize, y + offset + innerSize / 2)
    ctx.lineTo(x + offset + innerSize / 2, y + offset + innerSize)
    ctx.lineTo(x + offset, y + offset + innerSize / 2)
    ctx.closePath()
    ctx.stroke()
  }

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full object-contain ${className}`}
      style={{ imageRendering: "pixelated" }}
    />
  )
}