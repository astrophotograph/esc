"use client"

import { useEffect, useRef } from "react"

interface VintageTestPatternProps {
  width?: number
  height?: number
  className?: string
  statusText?: string
}

export function VintageTestPattern({ width = 800, height = 600, className = "", statusText }: VintageTestPatternProps) {
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

    // Draw white background (Indian head pattern was typically white background)
    ctx.fillStyle = "#FFFFFF"
    ctx.fillRect(0, 0, width, height)

    const centerX = width / 2
    const centerY = height / 2
    const maxRadius = Math.min(width, height) * 0.35

    // Draw the main circle (Indian head silhouette area)
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI)
    ctx.stroke()

    // Draw inner concentric circles (classic Indian head pattern feature)
    for (let i = 1; i <= 6; i++) {
      ctx.lineWidth = i === 6 ? 3 : 2
      ctx.beginPath()
      ctx.arc(centerX, centerY, (maxRadius * i) / 7, 0, 2 * Math.PI)
      ctx.stroke()
    }

    // Draw the "Indian head" silhouette (simplified geometric representation)
    drawIndianHeadSilhouette(ctx, centerX, centerY, maxRadius * 0.6)

    // Draw resolution wedges in corners (classic test pattern feature)
    drawResolutionWedge(ctx, 50, 50, 80, "TOP-LEFT")
    drawResolutionWedge(ctx, width - 130, 50, 80, "TOP-RIGHT")
    drawResolutionWedge(ctx, 50, height - 130, 80, "BOTTOM-LEFT")
    drawResolutionWedge(ctx, width - 130, height - 130, 80, "BOTTOM-RIGHT")

    // Draw horizontal and vertical registration marks
    ctx.lineWidth = 2
    ctx.strokeStyle = "#000000"
    
    // Horizontal center line
    ctx.beginPath()
    ctx.moveTo(centerX - maxRadius * 1.3, centerY)
    ctx.lineTo(centerX - maxRadius * 1.1, centerY)
    ctx.moveTo(centerX + maxRadius * 1.1, centerY)
    ctx.lineTo(centerX + maxRadius * 1.3, centerY)
    ctx.stroke()
    
    // Vertical center line
    ctx.beginPath()
    ctx.moveTo(centerX, centerY - maxRadius * 1.3)
    ctx.lineTo(centerX, centerY - maxRadius * 1.1)
    ctx.moveTo(centerX, centerY + maxRadius * 1.1)
    ctx.lineTo(centerX, centerY + maxRadius * 1.3)
    ctx.stroke()

    // Draw frequency response bars (top and bottom)
    drawFrequencyBars(ctx, centerX - 150, 20, 300, 25)
    drawFrequencyBars(ctx, centerX - 150, height - 45, 300, 25)
    
    // Draw alignment marks in corners
    drawAlignmentMark(ctx, 20, 20)
    drawAlignmentMark(ctx, width - 40, 20)
    drawAlignmentMark(ctx, 20, height - 40)
    drawAlignmentMark(ctx, width - 40, height - 40)

    // Add classic test pattern text at bottom
    ctx.fillStyle = "#000000"
    ctx.font = "bold 24px serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    
    // Main "PLEASE STAND BY" text
    ctx.fillText("PLEASE STAND BY", centerX, height * 0.85)
    
    // Add status text if provided, otherwise use default subtitle
    ctx.font = "16px serif"
    if (statusText) {
      ctx.fillText(statusText, centerX, height * 0.9)
    } else {
      ctx.fillText("TELESCOPE SIGNAL INTERRUPTED", centerX, height * 0.9)
    }
    
    // Add technical info in corners (classic test pattern style)
    ctx.font = "12px monospace"
    ctx.textAlign = "left"
    ctx.fillText("RESOLUTION", 20, height - 40)
    ctx.fillText("1920×1080", 20, height - 25)
    
    ctx.textAlign = "right"
    ctx.fillText("MONOSCOPE", width - 20, height - 40)
    const currentTime = new Date().toLocaleTimeString()
    ctx.fillText(currentTime, width - 20, height - 25)
    
    // Center identification
    ctx.textAlign = "center"
    ctx.font = "14px serif"
    ctx.fillText("TEST PATTERN", centerX, height * 0.95)

    // Reset shadow
    ctx.shadowColor = "transparent"
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

  }, [width, height, statusText])

  // Helper function to draw Indian head silhouette (simplified geometric representation)
  function drawIndianHeadSilhouette(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
    ctx.fillStyle = "#000000"
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    
    // Draw a simplified profile silhouette
    ctx.beginPath()
    
    // Face profile (right-facing)
    const faceStartX = centerX - radius * 0.3
    const faceStartY = centerY - radius * 0.6
    
    // Forehead
    ctx.moveTo(faceStartX, faceStartY)
    ctx.lineTo(faceStartX + radius * 0.4, faceStartY)
    
    // Nose
    ctx.lineTo(faceStartX + radius * 0.5, centerY - radius * 0.1)
    ctx.lineTo(faceStartX + radius * 0.4, centerY + radius * 0.1)
    
    // Chin and neck
    ctx.lineTo(faceStartX + radius * 0.2, centerY + radius * 0.4)
    ctx.lineTo(faceStartX - radius * 0.1, centerY + radius * 0.5)
    
    // Back of head
    ctx.lineTo(faceStartX - radius * 0.4, centerY + radius * 0.2)
    ctx.lineTo(faceStartX - radius * 0.5, centerY - radius * 0.2)
    ctx.lineTo(faceStartX - radius * 0.3, faceStartY)
    
    ctx.closePath()
    ctx.fill()
    
    // Draw feather pattern (simplified)
    drawFeatherPattern(ctx, centerX - radius * 0.7, centerY - radius * 0.5, radius * 0.3)
  }

  // Helper function to draw feather pattern
  function drawFeatherPattern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    
    for (let i = 0; i < 3; i++) {
      const featherX = x + i * size * 0.15
      const featherY = y + i * size * 0.1
      
      // Main feather stem
      ctx.beginPath()
      ctx.moveTo(featherX, featherY)
      ctx.lineTo(featherX, featherY + size * 0.8)
      ctx.stroke()
      
      // Feather barbs
      for (let j = 0; j < 5; j++) {
        const barbY = featherY + (j + 1) * size * 0.15
        ctx.beginPath()
        ctx.moveTo(featherX - size * 0.1, barbY)
        ctx.lineTo(featherX + size * 0.1, barbY)
        ctx.stroke()
      }
    }
  }

  // Helper function to draw resolution wedges (classic test pattern element)
  function drawResolutionWedge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, label: string) {
    ctx.strokeStyle = "#000000"
    ctx.fillStyle = "#000000"
    ctx.lineWidth = 1
    
    // Draw wedge pattern with increasing line density
    for (let i = 0; i < 12; i++) {
      const lineSpacing = size / (i + 2)
      const startX = x + (i * size) / 12
      
      for (let j = 0; j < size; j += lineSpacing) {
        ctx.beginPath()
        ctx.moveTo(startX, y + j)
        ctx.lineTo(startX + size / 12, y + j)
        ctx.stroke()
      }
    }
    
    // Add label
    ctx.font = "8px monospace"
    ctx.textAlign = "center"
    ctx.fillText(label, x + size / 2, y + size + 12)
  }

  // Helper function to draw frequency response bars
  function drawFrequencyBars(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    const barCount = 15
    const barWidth = width / barCount
    
    for (let i = 0; i < barCount; i++) {
      // Alternate between black and white bars with varying widths
      const intensity = Math.sin((i / barCount) * Math.PI * 2) * 0.5 + 0.5
      ctx.fillStyle = `rgb(${Math.floor(intensity * 255)}, ${Math.floor(intensity * 255)}, ${Math.floor(intensity * 255)})`
      ctx.fillRect(x + i * barWidth, y, barWidth, height)
    }
  }

  // Helper function to draw alignment marks
  function drawAlignmentMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    
    // Draw crosshair
    ctx.beginPath()
    ctx.moveTo(x - 10, y)
    ctx.lineTo(x + 10, y)
    ctx.moveTo(x, y - 10)
    ctx.lineTo(x, y + 10)
    ctx.stroke()
    
    // Draw circle
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, 2 * Math.PI)
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