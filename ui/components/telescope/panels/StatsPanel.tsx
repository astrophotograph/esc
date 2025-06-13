"use client"

import { Button } from "@/components/ui/button"
import { Award, BarChart3, Star, TrendingUp } from "lucide-react"
import { useMemo } from "react"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { getObjectTypeIcon, renderStarRating } from "@/utils/telescope-utils"
import type { CelestialObjectType } from "@/types/telescope-types"

export function StatsPanel() {
  const { observationLog, setShowStatsPanel } = useTelescopeContext()

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

    // Object type preferences - add null checks
    const typeCount: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.target && obs.target.type) {
        typeCount[obs.target.type] = (typeCount[obs.target.type] || 0) + 1
      }
    })

    // Target frequency - add null checks
    const targetCount: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.target && obs.target.name) {
        targetCount[obs.target.name] = (targetCount[obs.target.name] || 0) + 1
      }
    })

    // Seeing conditions - add null checks
    const seeingCount: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.conditions && obs.conditions.seeing) {
        seeingCount[obs.conditions.seeing] = (seeingCount[obs.conditions.seeing] || 0) + 1
      }
    })

    // Rating distribution - add null checks
    const ratingDistribution: Record<number, number> = {}
    observationLog.forEach((obs) => {
      if (typeof obs.rating === "number") {
        ratingDistribution[obs.rating] = (ratingDistribution[obs.rating] || 0) + 1
      }
    })

    // Weather distribution - add null checks
    const weatherDistribution: Record<string, number> = {}
    observationLog.forEach((obs) => {
      if (obs.conditions && obs.conditions.weather) {
        weatherDistribution[obs.conditions.weather] = (weatherDistribution[obs.conditions.weather] || 0) + 1
      }
    })

    // Recent activity - add null checks
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentActivity = observationLog.filter((obs) => obs.timestamp && obs.timestamp > sevenDaysAgo).length

    // Top rated observations - add null checks
    const topRatedObservations = [...observationLog]
      .filter((obs) => obs.target && typeof obs.rating === "number")
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3)

    // Determine favorite object type
    let favoriteObjectType = "None"
    let maxTypeCount = 0
    for (const [type, count] of Object.entries(typeCount)) {
      if (count > maxTypeCount) {
        maxTypeCount = count
        favoriteObjectType = type
      }
    }

    // Determine most observed target
    let mostObservedTarget = "None"
    let maxTargetCount = 0
    for (const [target, count] of Object.entries(targetCount)) {
      if (count > maxTargetCount) {
        maxTargetCount = count
        mostObservedTarget = target
      }
    }

    // Determine best seeing condition
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

  return (
    <div className="absolute top-4 left-4 w-96 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-sm max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-green-400 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Observation Statistics
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowStatsPanel(false)} className="h-6 w-6 p-0">
          ×
        </Button>
      </div>

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
  )
}
