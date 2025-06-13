"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Focus } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"

export function FocusControl() {
  const { focusPosition, setFocusPosition, handleFocusAdjust } = useTelescopeContext()

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Focus className="w-5 h-5" />
          Focus Control
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">Position</span>
            <span className="text-white">{focusPosition[0]}</span>
          </div>
          <Slider value={focusPosition} onValueChange={setFocusPosition} max={10000} step={10} className="w-full" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFocusAdjust("in")}
            className="flex-1 border-gray-600 text-white hover:bg-gray-700"
          >
            Focus In
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFocusAdjust("out")}
            className="flex-1 border-gray-600 text-white hover:bg-gray-700"
          >
            Focus Out
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
