"use client"

import { Button } from "@/components/ui/button"
import { Clock, Trash2 } from "lucide-react"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { getObjectTypeIcon, renderStarRating } from "@/utils/telescope-utils"

export function LogPanel() {
  const { observationLog, deleteObservation, setShowLogPanel } = useTelescopeContext()

  return (
    <div className="absolute top-4 right-4 w-80 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-sm max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-green-400">Observation Log</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowLogPanel(false)} className="h-6 w-6 p-0">
          ×
        </Button>
      </div>

      <div className="space-y-3">
        {observationLog.length > 0 ? (
          observationLog.map((entry) => (
            <div key={entry.id} className="bg-gray-800/50 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getObjectTypeIcon(entry?.target?.type)}
                  <span className="font-medium text-white">{entry?.target?.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteObservation(entry.id)}
                  className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{entry.timestamp.toLocaleString()}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Rating:</span>
                {renderStarRating(entry.rating)}
              </div>

              {entry.notes && <div className="text-xs text-gray-300 bg-gray-700/50 rounded p-2">{entry.notes}</div>}

              <div className="text-xs text-gray-400 space-y-1">
                <div>
                  Conditions: {entry.conditions.weather}, {entry.conditions.seeing}
                </div>
                <div>
                  Moon: {entry.conditions.moonPhase} ({Math.round(entry.conditions.moonIllumination)}%)
                </div>
                <div>
                  Settings: {entry.settings.exposure}s, Gain {entry.settings.gain}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-gray-400 text-center py-4">No observations logged yet</div>
        )}
      </div>
    </div>
  )
}
