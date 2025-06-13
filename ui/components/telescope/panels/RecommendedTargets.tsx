"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Info, Target } from "lucide-react"
import { useMemo } from "react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import { getObjectTypeIcon } from "../../../utils/telescope-utils"

export function RecommendedTargets() {
  const { celestialObjects, systemStats, selectedTarget, handleTargetSelect } = useTelescopeContext()

  // Get recommended targets based on current conditions
  const recommendedTargets = useMemo(() => {
    const currentMoonPhase = systemStats.moon.phase
    const moonIllumination = systemStats.moon.illumination
    const moonIsVisible = systemStats.moon.isVisible
    const seeingCondition = systemStats.weather.seeingCondition

    // Determine optimal moon phase category
    let optimalPhase: "new" | "crescent" | "quarter" | "gibbous" | "full" | "any" = "any"

    if (moonIllumination < 10) optimalPhase = "new"
    else if (moonIllumination < 40) optimalPhase = "crescent"
    else if (moonIllumination < 60) optimalPhase = "quarter"
    else if (moonIllumination < 90) optimalPhase = "gibbous"
    else optimalPhase = "full"

    // Filter objects based on current conditions
    return celestialObjects
      .filter((object) => {
        // If moon is bright and visible, prefer brighter objects or those that can be viewed in moonlight
        if (moonIsVisible && moonIllumination > 50) {
          return (
            object.isCurrentlyVisible &&
            (object.magnitude < 5 || object.optimalMoonPhase === "any" || object.type === "planet")
          )
        }

        // If seeing is poor, prefer brighter objects and those that don't need perfect seeing
        if (seeingCondition === "Poor") {
          return (
            object.isCurrentlyVisible &&
            (object.magnitude < 6 || object.type === "planet" || object.type === "double-star")
          )
        }

        // Default filtering - visible objects that match current moon phase or are always viewable
        return (
          object.isCurrentlyVisible && (object.optimalMoonPhase === optimalPhase || object.optimalMoonPhase === "any")
        )
      })
      .sort((a, b) => {
        // Sort by magnitude (brightness) - lower magnitude is brighter
        return a.magnitude - b.magnitude
      })
      .slice(0, 5) // Return top 5 recommendations
  }, [celestialObjects, systemStats])

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Target className="w-5 h-5" />
          Recommended Targets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-gray-300 mb-2">
          Based on current moon phase ({systemStats.moon.phase}) and conditions:
        </div>

        <div className="space-y-2">
          {recommendedTargets.length > 0 ? (
            recommendedTargets.map((target) => (
              <div
                key={target.id}
                className={`p-2 rounded-md transition-colors cursor-pointer flex items-center justify-between ${
                  selectedTarget?.id === target.id ? "bg-gray-700 border border-gray-600" : "hover:bg-gray-700/50"
                }`}
                onClick={() => handleTargetSelect(target)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6">{getObjectTypeIcon(target.type)}</div>
                  <div>
                    <div className="font-medium text-white">{target.name}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <span>Mag: {target.magnitude}</span>
                      <span>•</span>
                      <span>{target.type}</span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Info className="h-4 w-4" />
                  <span className="sr-only">Info</span>
                </Button>
              </div>
            ))
          ) : (
            <div className="text-gray-400 text-center py-2">No optimal targets available</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
