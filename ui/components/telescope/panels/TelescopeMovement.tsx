"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function TelescopeMovement() {
  const { isTracking, setIsTracking, handleTelescopeMove } = useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Telescope Control</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div></div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTelescopeMove("north")}
            className="border-gray-600 text-white hover:bg-gray-700"
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
          <div></div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTelescopeMove("west")}
            className="border-gray-600 text-white hover:bg-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTelescopeMove("stop")}
            className="border-gray-600 text-white hover:bg-gray-700"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTelescopeMove("east")}
            className="border-gray-600 text-white hover:bg-gray-700"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
          <div></div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTelescopeMove("south")}
            className="border-gray-600 text-white hover:bg-gray-700"
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
          <div></div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Tracking</span>
          <Switch checked={isTracking} onCheckedChange={setIsTracking} />
        </div>
      </CardContent>
    </Card>
  )
}
