"use client"

import { Button } from "@/components/ui/button"
import { Award, BarChart3, Star, TrendingUp, Move } from "lucide-react"
import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { getObjectTypeIcon, renderStarRating } from "@/utils/telescope-utils"
import { NeonDial, NeonDialGrid } from "../NeonDial"
import { useTheme } from "next-themes"
import { usePersistentState } from "@/hooks/use-persistent-state"
import type { CelestialObjectType } from "@/types/telescope-types"

export function NeonStatsPanel() {
  const { observationLog, setShowStatsPanel } = useTelescopeContext()
  const { theme } = useTheme()
  
  // Only show neon dials in neon theme
  const isNeonTheme = theme === 'neon'
  
  // Use persistent state for panel position
  const [panelPosition, setPanelPosition] = usePersistentState<{ x: number; y: number } | undefined>(
    'stats-panel-position',
    undefined
  )
  
  const panelRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  // Helper function to ensure position is within screen bounds
  const ensureWithinBounds = useCallback((pos: { x: number; y: number }) => {
    const panelWidth = isNeonTheme ? 500 : 384 // w-[500px] or w-96
    const panelHeight = 400
    const padding = 20
    
    const maxX = window.innerWidth - panelWidth - padding
    const maxY = window.innerHeight - panelHeight - padding
    
    return {
      x: Math.min(Math.max(padding, pos.x), maxX),
      y: Math.min(Math.max(padding, pos.y), maxY)
    }
  }, [isNeonTheme])
  
  // Initialize panel position
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (panelPosition === undefined) {
        // Default position: top-left
        setPanelPosition({ x: 20, y: 20 })
      } else {
        // Ensure stored position is within bounds
        const boundedPos = ensureWithinBounds(panelPosition)
        if (boundedPos.x !== panelPosition.x || boundedPos.y !== panelPosition.y) {
          setPanelPosition(boundedPos)
        }
      }
    }
  }, [panelPosition, setPanelPosition, ensureWithinBounds])
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (panelPosition) {
        const boundedPos = ensureWithinBounds(panelPosition)
        if (boundedPos.x !== panelPosition.x || boundedPos.y !== panelPosition.y) {
          setPanelPosition(boundedPos)
        }
      }
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [panelPosition, setPanelPosition, ensureWithinBounds])
  
  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    const rect = panelRef.current?.getBoundingClientRect()
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
    const boundedPos = ensureWithinBounds({ x: newX, y: newY })
    setPanelPosition(boundedPos)
  }, [isDragging, dragOffset.x, dragOffset.y, setPanelPosition, ensureWithinBounds])
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])
  
  // Set up drag event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Calculate observation statistics
  const observationStats = useMemo(() => {
    if (observationLog.length === 0) {
      return {
        totalObservations: 0,
        averageRating: 0,
        favoriteObjectType: "None",
        bestSeeingCondition: "None",
        mostObservedTarget: "None",
        observationsByType: {},
        ratingDistribution: {},
        seeingDistribution: {},
        weatherDistribution: {},
        recentActivity: 0,
        topRatedObservations: [],
      }
    }

    // Basic stats
    const totalObservations = observationLog.length
    const averageRating =
      observationLog.length > 0
        ? observationLog.reduce((sum, obs) => sum + (obs.rating || 0), 0) / observationLog.length
        : 0

    // Object type preferences
    const typeCount: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.target && obs.target.type) {
        typeCount[obs.target.type] = (typeCount[obs.target.type] || 0) + 1
      }
    })

    // Target frequency
    const targetCount: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.target && obs.target.name) {
        targetCount[obs.target.name] = (targetCount[obs.target.name] || 0) + 1
      }
    })

    // Seeing conditions
    const seeingCount: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.conditions && obs.conditions.seeing) {
        seeingCount[obs.conditions.seeing] = (seeingCount[obs.conditions.seeing] || 0) + 1
      }
    })

    // Rating distribution
    const ratingDistribution: Record<number, number> = {}
    observationLog.forEach((obs) => {
      if (typeof obs.rating === "number") {
        ratingDistribution[obs.rating] = (ratingDistribution[obs.rating] || 0) + 1
      }
    })

    // Weather distribution
    const weatherDistribution: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.conditions && obs.conditions.weather) {
        weatherDistribution[obs.conditions.weather] = (weatherDistribution[obs.conditions.weather] || 0) + 1
      }
    })

    // Recent activity
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentActivity = observationLog.filter((obs) => obs.timestamp && obs.timestamp > sevenDaysAgo).length

    // Top rated observations
    const topRatedObservations = [...observationLog]
      .filter((obs) => obs.target && typeof obs.rating === "number")
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3)

    // Determine favorites
    let favoriteObjectType = "None"
    let maxTypeCount = 0
    for (const [type, count] of Object.entries(typeCount)) {
      if (count > maxTypeCount) {
        maxTypeCount = count
        favoriteObjectType = type
      }
    }

    let mostObservedTarget = "None"
    let maxTargetCount = 0
    for (const [target, count] of Object.entries(targetCount)) {
      if (count > maxTargetCount) {
        maxTargetCount = count
        mostObservedTarget = target
      }
    }

    let bestSeeingCondition = "None"
    let maxSeeingCount = 0
    for (const [seeing, count] of Object.entries(seeingCount)) {
      if (count > maxSeeingCount) {
        maxSeeingCount = count
        bestSeeingCondition = seeing
      }
    }

    return {
      totalObservations,
      averageRating,
      favoriteObjectType,
      bestSeeingCondition,
      mostObservedTarget,
      observationsByType: typeCount,
      ratingDistribution,
      seeingDistribution: seeingCount,
      weatherDistribution,
      recentActivity,
      topRatedObservations,
    }
  }, [observationLog])
  
  // Don't render until position is initialized
  if (!panelPosition) return null

  if (isNeonTheme) {
    return (
      <div 
        ref={panelRef}
        className="fixed w-[500px] bg-black/90 backdrop-blur-sm rounded-lg neon-border-glow"
        style={{ 
          left: `${panelPosition.x}px`, 
          top: `${panelPosition.y}px`,
          zIndex: 1000 
        }}
      >
        <div 
          className="flex items-center justify-between p-4 pb-2 cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <h3 className="font-bold text-lg neon-text flex items-center gap-2 flex-1">
            <Move className="w-4 h-4 opacity-60" />
            <BarChart3 className="w-5 h-5" />
            OBSERVATION METRICS
          </h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowStatsPanel(false)} 
            className="h-8 w-8 p-0 neon-button"
          >
            ×
          </Button>
        </div>
        
        <div className="p-6 pt-2">
          {/* Neon Dials Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <NeonDial
              value={observationStats.totalObservations}
              max={Math.max(100, observationStats.totalObservations * 1.2)}
              label="Total"
              unit="OBS"
              size={120}
              color="#00FFD4"
            />
            <NeonDial
              value={observationStats.averageRating}
              max={5}
              label="Rating"
              unit="★"
              size={120}
              color="#00D9FF"
            />
            <NeonDial
              value={observationStats.recentActivity}
              max={Math.max(20, observationStats.recentActivity * 1.5)}
              label="7-Day"
              unit="NEW"
              size={120}
              color="#00FFF0"
            />
          </div>

          {/* Data Grid */}
          <div className="space-y-3 text-sm max-h-[400px] overflow-y-auto">
            {/* Type Distribution */}
            <div className="bg-gray-900/50 rounded-md p-3 neon-border">
              <div className="font-medium mb-2 neon-text uppercase tracking-wider">Object Distribution</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(observationStats.observationsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {type && getObjectTypeIcon(type as CelestialObjectType)}
                      <span className="capitalize opacity-80">{type || "Unknown"}</span>
                    </div>
                    <div className="tabular-nums font-mono neon-text">{count}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Observations */}
            <div className="bg-gray-900/50 rounded-md p-3 neon-border">
              <div className="font-medium mb-2 neon-text uppercase tracking-wider">Top Rated</div>
              <div className="space-y-2">
                {observationStats.topRatedObservations.map((obs, index) => (
                  <div key={obs.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-mono">#{index + 1}</span>
                      <span className="opacity-80">{obs.target?.name || "Unknown"}</span>
                    </div>
                    <div className="flex items-center gap-1">{renderStarRating(obs.rating || 0)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Conditions */}
            <div className="bg-gray-900/50 rounded-md p-3 neon-border">
              <div className="font-medium mb-2 neon-text uppercase tracking-wider">Conditions</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs opacity-60 mb-1">WEATHER</div>
                  {Object.entries(observationStats.weatherDistribution).map(([weather, count]) => (
                    <div key={weather} className="flex justify-between">
                      <span className="opacity-80">{weather}</span>
                      <span className="font-mono neon-text">{count}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs opacity-60 mb-1">SEEING</div>
                  {Object.entries(observationStats.seeingDistribution).map(([seeing, count]) => (
                    <div key={seeing} className="flex justify-between">
                      <span className="opacity-80">{seeing}</span>
                      <span className="font-mono neon-text">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Animated scanline effect */}
          <div className="scanline" />
        </div>
      </div>
    )
  }

  // Default theme (original layout)
  return (
    <div 
      ref={panelRef}
      className="fixed w-96 bg-black/80 backdrop-blur-sm rounded-lg text-sm"
      style={{ 
        left: `${panelPosition.x}px`, 
        top: `${panelPosition.y}px`,
        zIndex: 1000 
      }}
    >
      <div 
        className="flex items-center justify-between p-3 cursor-move select-none border-b border-gray-700"
        onMouseDown={handleMouseDown}
      >
        <h3 className="font-semibold text-green-400 flex items-center gap-2 flex-1">
          <Move className="w-3 h-3 opacity-60" />
          <BarChart3 className="w-4 h-4" />
          Observation Statistics
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowStatsPanel(false)} className="h-6 w-6 p-0">
          ×
        </Button>
      </div>
      
      <div className="p-4 max-h-96 overflow-y-auto">
        <div className="space-y-4">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/50 rounded-md p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">{observationStats.totalObservations}</div>
              <div className="text-xs text-gray-400">Total Observations</div>
            </div>
            <div className="bg-gray-800/50 rounded-md p-3 text-center">
              <div className="text-2xl font-bold text-yellow-400 flex items-center justify-center gap-1">
                {observationStats.averageRating.toFixed(1)}
                <Star className="w-4 h-4 fill-yellow-400" />
              </div>
              <div className="text-xs text-gray-400">Average Rating</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-800/50 rounded-md p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="font-medium text-white">Recent Activity</span>
            </div>
            <div className="text-sm text-gray-300">{observationStats.recentActivity} observations in the last 7 days</div>
          </div>

          {/* Preferences */}
          <div className="bg-gray-800/50 rounded-md p-3">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-purple-400" />
              <span className="font-medium text-white">Preferences</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Favorite Type:</span>
                <span className="text-white capitalize">{observationStats.favoriteObjectType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Most Observed:</span>
                <span className="text-white">{observationStats.mostObservedTarget}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Best Seeing:</span>
                <span className="text-white">{observationStats.bestSeeingCondition}</span>
              </div>
            </div>
          </div>

          {/* Object Type Distribution */}
          <div className="bg-gray-800/50 rounded-md p-3">
            <div className="font-medium text-white mb-2">Object Type Distribution</div>
            <div className="space-y-2">
              {Object.entries(observationStats.observationsByType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {type && getObjectTypeIcon(type as CelestialObjectType)}
                    <span className="text-gray-300 capitalize">{type || "Unknown"}</span>
                  </div>
                  <span className="text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rating Distribution */}
          <div className="bg-gray-800/50 rounded-md p-3">
            <div className="font-medium text-white mb-2">Rating Distribution</div>
            <div className="space-y-1">
              {[5, 4, 3, 2, 1].map((rating) => (
                <div key={rating} className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Star className={`w-3 h-3 ${rating <= 5 ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} />
                    <span className="text-gray-300">{rating}</span>
                  </div>
                  <div className="flex-1 bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${((observationStats.ratingDistribution[rating] || 0) / observationStats.totalObservations) * 100}%`,
                      }}
                    ></div>
                  </div>
                  <span className="text-white w-6 text-right">{observationStats.ratingDistribution[rating] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Rated Observations */}
          <div className="bg-gray-800/50 rounded-md p-3">
            <div className="font-medium text-white mb-2">Top Rated Observations</div>
            <div className="space-y-2">
              {observationStats.topRatedObservations.map((obs, index) => (
                <div key={obs.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">#{index + 1}</span>
                    {obs.target && obs.target.type && getObjectTypeIcon(obs.target.type)}
                    <span className="text-gray-300">{obs.target?.name || "Unknown Target"}</span>
                  </div>
                  <div className="flex items-center gap-1">{renderStarRating(obs.rating || 0)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weather Conditions */}
          <div className="bg-gray-800/50 rounded-md p-3">
            <div className="font-medium text-white mb-2">Observation Conditions</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-gray-400 mb-1">Weather</div>
                {Object.entries(observationStats.weatherDistribution).map(([weather, count]) => (
                  <div key={weather} className="flex justify-between">
                    <span className="text-gray-300">{weather}</span>
                    <span className="text-white">{count}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-gray-400 mb-1">Seeing</div>
                {Object.entries(observationStats.seeingDistribution).map(([seeing, count]) => (
                  <div key={seeing} className="flex justify-between">
                    <span className="text-gray-300">{seeing}</span>
                    <span className="text-white">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}