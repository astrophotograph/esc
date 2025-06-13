"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { BookOpen, Save } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import { renderStarRating } from "../../../utils/telescope-utils"

export function ObservationLogger() {
  const {
    selectedTarget,
    observationNotes,
    setObservationNotes,
    observationRating,
    setObservationRating,
    saveObservation,
    exposure,
    gain,
    brightness,
    focusPosition,
    systemStats,
  } = useTelescopeContext()

  if (!selectedTarget) return null

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Log Observation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-gray-300 mb-2">Target: {selectedTarget.name}</div>
          <div className="text-xs text-gray-400">
            {selectedTarget.type} • Magnitude: {selectedTarget.magnitude}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-300 mb-2 block">Rating</label>
          {renderStarRating(observationRating, true, setObservationRating)}
        </div>

        <div>
          <label className="text-sm text-gray-300 mb-2 block">Notes</label>
          <Textarea
            value={observationNotes}
            onChange={(e) => setObservationNotes(e.target.value)}
            placeholder="Add your observation notes..."
            className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 resize-none"
            rows={3}
          />
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <div>Current Settings:</div>
          <div>
            • Exposure: {exposure[0]}s, Gain: {gain[0]}
          </div>
          <div>
            • Focus: {focusPosition[0]}, Brightness: {brightness[0]}
          </div>
          <div>• Weather: {systemStats.weather.condition}</div>
          <div>• Seeing: {systemStats.weather.seeingCondition}</div>
        </div>

        <Button
          onClick={saveObservation}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
          disabled={!observationNotes.trim()}
        >
          <Save className="w-4 h-4 mr-2" />
          Save Observation
        </Button>
      </CardContent>
    </Card>
  )
}
