"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { EyeOff } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings, X, Minimize2, Maximize2, Camera, Eye, Expand, Minimize } from "lucide-react"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { PipOverlays } from "./PipOverlays"

export function PictureInPictureOverlay() {
  const {
    showPiP,
    setShowPiP,
    pipPosition,
    setPipPosition,
    pipSize,
    setPipSize,
    pipCamera,
    setPipCamera,
    pipMinimized,
    setPipMinimized,
    setShowPipOverlayControls,
    pipOverlaySettings,
    currentTelescope,
    allskyUrls,
    setAllskyUrls,
    showPipStatus,
    setShowPipStatus,
    pipFullscreen,
    setPipFullscreen,
  } = useTelescopeContext()

  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [timestamp, setTimestamp] = useState(Date.now())
  const pipRef = useRef<HTMLDivElement>(null)

  // Size configurations
  const sizeConfig = {
    small: { width: 200, height: 150 },
    medium: { width: 320, height: 240 },
    large: { width: 480, height: 360 },
    "extra-large": { width: 640, height: 480 },
  }

  const currentSize = pipFullscreen 
    ? { width: window.innerWidth, height: window.innerHeight } 
    : sizeConfig[pipSize]

  // Update timestamp every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTimestamp(Date.now());
    }, 10000);

    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, []);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pipFullscreen) {
        setPipFullscreen(false)
      }
    }

    if (pipFullscreen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [pipFullscreen, setPipFullscreen])

  // Camera feed URLs (simulated)
  const getCameraFeed = () => {
    const telescopeId = currentTelescope?.id || ''
    const customUrl = allskyUrls[telescopeId] || ''
    const feeds = {
      allsky: customUrl || `http://allsky/current/tmp/image.jpg?_ts=${timestamp}`,
      guide: "/placeholder.svg?height=240&width=320&text=Guide+Camera",
      finder: "/placeholder.svg?height=240&width=320&text=Finder+Scope",
    }
    return feeds[pipCamera]
  }

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (pipMinimized) return

    setIsDragging(true)
    const rect = pipRef.current?.getBoundingClientRect()
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

    // Keep within viewport bounds
    const headerHeight = 40
    const totalHeight = pipMinimized ? headerHeight : currentSize.height + headerHeight
    const maxX = window.innerWidth - currentSize.width
    const maxY = window.innerHeight - totalHeight

    setPipPosition({
      x: Math.max(0, Math.min(maxX, newX)),
      y: Math.max(0, Math.min(maxY, newY)),
    })
  }, [isDragging, dragOffset.x, dragOffset.y, pipMinimized, currentSize.width, currentSize.height, setPipPosition])

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging, dragOffset, handleMouseMove])

  // Handle window resize to keep PiP in bounds
  useEffect(() => {
    const handleResize = () => {
      if (pipFullscreen) return
      
      const headerHeight = 40
      const totalHeight = pipMinimized ? headerHeight : currentSize.height + headerHeight
      const maxX = window.innerWidth - currentSize.width
      const maxY = window.innerHeight - totalHeight

      setPipPosition(prevPosition => ({
        x: Math.max(0, Math.min(maxX, prevPosition.x)),
        y: Math.max(0, Math.min(maxY, prevPosition.y)),
      }))
    }

    window.addEventListener("resize", handleResize)
    
    // Check bounds on mount and when size changes
    handleResize()

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [currentSize.width, currentSize.height, pipFullscreen, pipMinimized, setPipPosition])

  // Don't render if PiP is not enabled
  if (!showPiP) return null

  return (
    <div
      ref={pipRef}
      className={`fixed z-[9999] bg-gray-800 shadow-2xl border border-gray-600 ${
        pipFullscreen 
          ? "inset-0 rounded-none" 
          : "rounded-lg"
      }`}
      style={pipFullscreen ? {
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        cursor: "default",
      } : {
        left: pipPosition.x,
        top: pipPosition.y,
        width: pipMinimized ? 200 : currentSize.width,
        height: pipMinimized ? 40 : currentSize.height + 40, // +40 for header
        cursor: isDragging ? "grabbing" : "grab",
      }}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between p-1 bg-gray-700 min-w-0 ${
          pipFullscreen ? "rounded-none cursor-default" : "rounded-t-lg cursor-grab"
        }`}
        onMouseDown={pipFullscreen ? undefined : handleMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Camera className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {(pipSize === "large" || pipSize === "extra-large") && (
            <span className="text-sm text-gray-300 font-medium truncate">
              {pipCamera.charAt(0).toUpperCase() + pipCamera.slice(1)} Camera
            </span>
          )}
          {pipSize === "medium" && (
            <span className="text-xs text-gray-300 font-medium truncate">
              {pipCamera.charAt(0).toUpperCase() + pipCamera.slice(1)}
            </span>
          )}
          {!pipMinimized && (pipSize === "large" || pipSize === "extra-large") && (
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              {pipOverlaySettings.crosshairs.enabled && (
                <div className="w-2 h-2 bg-red-400 rounded-full" title="Crosshairs Active" />
              )}
              {pipOverlaySettings.grid.enabled && (
                <div className="w-2 h-2 bg-green-400 rounded-full" title="Grid Active" />
              )}
              {pipOverlaySettings.measurements.enabled && (
                <div className="w-2 h-2 bg-yellow-400 rounded-full" title="Measurements Active" />
              )}
              {pipOverlaySettings.compass.enabled && (
                <div className="w-2 h-2 bg-cyan-400 rounded-full" title="Compass Active" />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!pipMinimized && (
            <>
              {/* Camera Selector - show for medium and larger */}
              {(pipSize === "medium" || pipSize === "large" || pipSize === "extra-large") && (
                <Select value={pipCamera} onValueChange={(value: "allsky" | "guide" | "finder") => setPipCamera(value)}>
                  <SelectTrigger className={`h-6 text-xs bg-gray-600 border-gray-500 ${
                    pipSize === "medium" ? "w-14" : "w-20"
                  }`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 border-gray-600">
                    <SelectItem value="allsky">All-Sky</SelectItem>
                    <SelectItem value="guide">Guide</SelectItem>
                    <SelectItem value="finder">Finder</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Size Selector - always available but compact for smaller sizes */}
              <Select value={pipSize} onValueChange={(value: "small" | "medium" | "large" | "extra-large") => {
                setPipSize(value)
                // Ensure PiP stays in bounds after size change
                const newSize = sizeConfig[value]
                const maxX = window.innerWidth - newSize.width
                const maxY = window.innerHeight - newSize.height - 40 // 40 for header
                setPipPosition(prevPosition => ({
                  x: Math.max(0, Math.min(maxX, prevPosition.x)),
                  y: Math.max(0, Math.min(maxY, prevPosition.y)),
                }))
              }}>
                <SelectTrigger className={`h-6 text-xs bg-gray-600 border-gray-500 ${
                  pipSize === "small" ? "w-12" : pipSize === "medium" ? "w-14" : "w-16"
                }`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="small">S</SelectItem>
                  <SelectItem value="medium">M</SelectItem>
                  <SelectItem value="large">L</SelectItem>
                  <SelectItem value="extra-large">XL</SelectItem>
                </SelectContent>
              </Select>

              {/* Status Toggle - only show for large and extra-large */}
              {(pipSize === "large" || pipSize === "extra-large") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPipStatus(!showPipStatus)}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                  title={showPipStatus ? "Hide Status" : "Show Status"}
                >
                  {showPipStatus ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </Button>
              )}

              {/* Settings Button - only show for extra-large to save space */}
              {pipSize === "extra-large" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPipOverlayControls(true)}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                  title="Overlay Settings"
                >
                  <Settings className="h-3 w-3" />
                </Button>
              )}
            </>
          )}

          {/* Fullscreen Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPipFullscreen(!pipFullscreen)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
            title={pipFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {pipFullscreen ? <Minimize className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
          </Button>

          {/* Minimize/Maximize Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPipMinimized(!pipMinimized)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
            title={pipMinimized ? "Maximize" : "Minimize"}
          >
            {pipMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </Button>

          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPiP(false)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
            title="Close PiP"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Camera View */}
      {!pipMinimized && (
        <div className={`relative bg-black overflow-hidden ${
          pipFullscreen ? "rounded-none" : "rounded-b-lg"
        }`}>
          {/* Camera Feed */}
          <img
            src={getCameraFeed() || "/placeholder.svg"}
            alt={`${pipCamera} camera feed`}
            className="w-full h-full object-cover"
            style={{
              width: currentSize.width,
              height: currentSize.height,
            }}
          />

          {/* Overlays */}
          <PipOverlays width={currentSize.width} height={currentSize.height} camera={pipCamera} />

          {/* Live Status Indicator */}
          {showPipStatus && (
            <div className="absolute top-2 left-2 bg-black/70 rounded px-2 py-1">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-white font-mono">LIVE • 30 FPS</span>
              </div>
            </div>
          )}

          {/* Quick Overlay Toggle (for testing) */}
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPipOverlayControls(true)}
              className="h-6 w-6 p-0 bg-black/50 text-white hover:bg-black/70"
              title="Quick Settings"
            >
              <Eye className="h-3 w-3" />
            </Button>
          </div>

          {/* Overlay Status Bar */}
          <div className="absolute bottom-2 left-2 right-2 bg-black/70 rounded px-2 py-1">
            <div className="flex items-center justify-between text-xs text-white">
              <div className="flex items-center gap-2">
                <span className="font-mono">
                  {currentSize.width}×{currentSize.height}
                </span>
                <span className="text-gray-400">•</span>
                <span className="capitalize">{pipCamera}</span>
              </div>
              <div className="flex items-center gap-1">
                {pipOverlaySettings.crosshairs.enabled && <span className="text-red-400 text-xs">⊕</span>}
                {pipOverlaySettings.grid.enabled && <span className="text-green-400 text-xs">⊞</span>}
                {pipOverlaySettings.measurements.enabled && <span className="text-yellow-400 text-xs">📏</span>}
                {pipOverlaySettings.compass.enabled && <span className="text-cyan-400 text-xs">🧭</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
