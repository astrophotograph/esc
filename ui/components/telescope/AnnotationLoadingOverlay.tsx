"use client"

import { useState, useEffect } from "react"
import { Loader2, Search } from "lucide-react"
import { useTelescopeContext } from "../../context/TelescopeContext"

interface AnnotationLoadingOverlayProps {
  width: number
  height: number
}

export function AnnotationLoadingOverlay({ width, height }: AnnotationLoadingOverlayProps) {
  const { showAnnotations, annotationSettings } = useTelescopeContext()
  const [isLoading, setIsLoading] = useState(false)
  const [scanPosition, setScanPosition] = useState(0)

  useEffect(() => {
    if (showAnnotations && annotationSettings.enabled) {
      setIsLoading(true)
      setScanPosition(0)

      // Simulate scanning animation
      const scanInterval = setInterval(() => {
        setScanPosition((prev) => {
          if (prev >= 100) {
            clearInterval(scanInterval)
            setTimeout(() => setIsLoading(false), 500)
            return 100
          }
          return prev + 2
        })
      }, 40)

      return () => clearInterval(scanInterval)
    }
  }, [showAnnotations, annotationSettings.enabled])

  if (!isLoading) return null

  return (
    <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center z-20">
      {/* Scanning line effect */}
      <div
        className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-80 transition-all duration-100"
        style={{
          transform: `translateY(${(scanPosition / 100) * height}px)`,
          boxShadow: "0 0 10px rgba(59, 130, 246, 0.5)",
        }}
      />

      {/* Loading message */}
      <div className="bg-black/80 backdrop-blur-sm rounded-lg p-4 flex items-center gap-3 text-white">
        <div className="relative">
          <Search className="w-5 h-5 text-blue-400" />
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin absolute -top-1 -right-1" />
        </div>
        <div className="text-sm">
          <div className="font-medium">Analyzing celestial objects...</div>
          <div className="text-xs text-gray-400 mt-1">Scanning field of view ({Math.round(scanPosition)}%)</div>
        </div>
      </div>
    </div>
  )
}
