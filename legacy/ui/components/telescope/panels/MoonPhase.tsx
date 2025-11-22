"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Moon } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function MoonPhase() {
  const { systemStats } = useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Moon className="w-5 h-5" />
          Moon Phase
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-center">
          <div className="relative w-16 h-16 bg-gray-700 rounded-full overflow-hidden">
            {/* Moon visualization */}
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

        <div className="text-center space-y-2">
          <div>
            <div className="text-sm text-gray-300">Phase</div>
            <div className="text-white font-medium">{systemStats.moon.phase}</div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-300">Illumination</div>
              <div className="text-white font-medium">{Math.round(systemStats.moon.illumination)}%</div>
            </div>
            <div>
              <div className="text-gray-300">Age</div>
              <div className="text-white font-medium">{systemStats.moon.age.toFixed(1)} days</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm pt-2">
            <div>
              <div className="text-gray-300">Moonrise</div>
              <div className="text-white font-medium">{systemStats.moon.rise}</div>
            </div>
            <div>
              <div className="text-gray-300">Moonset</div>
              <div className="text-white font-medium">{systemStats.moon.set}</div>
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Currently Visible</span>
              <Badge variant={systemStats.moon.isVisible ? "default" : "secondary"}>
                {systemStats.moon.isVisible ? "Yes" : "No"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Moon impact on observing */}
        <div className="pt-2 border-t border-gray-700">
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
