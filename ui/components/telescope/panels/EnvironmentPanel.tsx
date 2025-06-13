"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Cloud, Droplets, Eye, Wind, Moon } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function EnvironmentPanel() {
  const { systemStats } = useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Environmental Conditions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Weather Conditions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300">Current Weather</h4>
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

        <Separator className="bg-gray-700" />

        {/* Moon Phase */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Moon className="w-4 h-4" />
            Moon Phase
          </h4>

          <div className="flex items-center justify-center">
            <div className="relative w-16 h-16 bg-gray-700 rounded-full overflow-hidden">
              <div className="absolute inset-0 bg-gray-300 rounded-full"></div>
              <div
                className="absolute inset-0 bg-gray-700 rounded-full transition-all duration-1000"
                style={{
                  clipPath:
                    systemStats.moon.illumination > 50
                      ? `inset(0 ${100 - systemStats.moon.illumination}% 0 0)`
                      : `inset(0 0 0 ${systemStats.moon.illumination}%)`,
                }}
              ></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center">
              <div className="text-gray-300">Phase</div>
              <div className="text-white font-medium">{systemStats.moon.phase}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">Illumination</div>
              <div className="text-white font-medium">{Math.round(systemStats.moon.illumination)}%</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">Age</div>
              <div className="text-white font-medium">{systemStats.moon.age.toFixed(1)} days</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">Visible</div>
              <Badge variant={systemStats.moon.isVisible ? "default" : "secondary"}>
                {systemStats.moon.isVisible ? "Yes" : "No"}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center">
              <div className="text-gray-300">Moonrise</div>
              <div className="text-white font-medium">{systemStats.moon.rise}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">Moonset</div>
              <div className="text-white font-medium">{systemStats.moon.set}</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Light Pollution</span>
            <Badge
              variant={
                systemStats.moon.illumination < 25
                  ? "default"
                  : systemStats.moon.illumination < 75
                    ? "secondary"
                    : "destructive"
              }
            >
              {systemStats.moon.illumination < 25
                ? "Minimal"
                : systemStats.moon.illumination < 75
                  ? "Moderate"
                  : "High"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
