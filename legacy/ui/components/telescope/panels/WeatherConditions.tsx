"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Cloud, Droplets, Eye, Wind } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function WeatherConditions() {
  const { systemStats } = useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Weather Conditions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-gray-300">Sky</div>
              <div className="text-white font-medium">{systemStats.weather.condition}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-gray-300">Humidity</div>
              <div className="text-white font-medium">{Math.round(systemStats.weather.humidity)}%</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-gray-400" />
            <div>
              <div className="text-gray-300">Wind</div>
              <div className="text-white font-medium">{systemStats.weather.windSpeed.toFixed(1)} m/s</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-green-400" />
            <div>
              <div className="text-gray-300">Seeing</div>
              <div className="text-white font-medium">
                {systemStats.weather.seeingCondition}
                <span className="text-xs text-gray-400 ml-1">({systemStats.weather.seeingValue.toFixed(1)}")</span>
              </div>
            </div>
          </div>
        </div>

        {/* Weather Status Indicator */}
        <div className="pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Observing Conditions</span>
            <Badge
              variant={
                systemStats.weather.seeingCondition === "Excellent" || systemStats.weather.seeingCondition === "Good"
                  ? "default"
                  : systemStats.weather.seeingCondition === "Fair"
                    ? "secondary"
                    : "destructive"
              }
            >
              {systemStats.weather.seeingCondition === "Excellent" || systemStats.weather.seeingCondition === "Good"
                ? "Optimal"
                : systemStats.weather.seeingCondition === "Fair"
                  ? "Moderate"
                  : "Poor"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
