"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Info, Search } from "lucide-react"
import { useMemo } from "react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import { getObjectTypeIcon } from "../../../utils/telescope-utils"

export function TargetSearch() {
  const { searchQuery, setSearchQuery, celestialObjects, selectedTarget, handleTargetSelect } = useTelescopeContext()

  // Filter celestial objects based on search query
  const filteredCelestialObjects = useMemo(() => {
    if (!searchQuery.trim()) return celestialObjects

    const query = searchQuery.toLowerCase().trim()
    return celestialObjects.filter(
      (obj) =>
        obj.name.toLowerCase().includes(query) ||
        obj.type.toLowerCase().includes(query) ||
        obj.description.toLowerCase().includes(query) ||
        obj.magnitude.toString().includes(query),
    )
  }, [celestialObjects, searchQuery])

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Search className="w-5 h-5" />
          Target Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by name, type, magnitude..."
            className="pl-9 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {filteredCelestialObjects.length > 0 ? (
            filteredCelestialObjects.map((target) => (
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
            <div className="text-gray-400 text-center py-4">No matching targets found</div>
          )}
        </div>

        <div className="pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                <span>Galaxy</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                <span>Nebula</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                <span>Cluster</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                <span>Planet</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <span>Double</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
