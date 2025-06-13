"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Settings, Star, AlertTriangle, CheckCircle } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import type { EquipmentSet } from "../../../types/telescope-types"

interface EquipmentSelectorProps {
  selectedEquipmentIds: string[]
  onSelectionChange: (equipmentIds: string[]) => void
  showCompatibilityCheck?: boolean
}

export function EquipmentSelector({
  selectedEquipmentIds,
  onSelectionChange,
  showCompatibilityCheck = true,
}: EquipmentSelectorProps) {
  const { equipment, equipmentSets } = useTelescopeContext()
  const [activeTab, setActiveTab] = useState<"individual" | "sets">("individual")

  const selectedEquipment = equipment.filter((eq) => selectedEquipmentIds.includes(eq.id))

  const toggleEquipment = (equipmentId: string) => {
    const newSelection = selectedEquipmentIds.includes(equipmentId)
      ? selectedEquipmentIds.filter((id) => id !== equipmentId)
      : [...selectedEquipmentIds, equipmentId]

    onSelectionChange(newSelection)
  }

  const selectEquipmentSet = (set: EquipmentSet) => {
    onSelectionChange(set.equipmentIds)
  }

  const getCompatibilityWarnings = () => {
    const warnings: string[] = []
    const telescopes = selectedEquipment.filter((eq) => eq.type === "telescope")
    const mounts = selectedEquipment.filter((eq) => eq.type === "mount")
    const cameras = selectedEquipment.filter((eq) => eq.type === "camera")

    if (telescopes.length > 1) {
      warnings.push("Multiple telescopes selected")
    }
    if (mounts.length > 1) {
      warnings.push("Multiple mounts selected")
    }
    if (cameras.length > 1) {
      warnings.push("Multiple cameras selected")
    }
    if (telescopes.length > 0 && mounts.length === 0) {
      warnings.push("Telescope selected but no mount")
    }

    return warnings
  }

  const compatibilityWarnings = showCompatibilityCheck ? getCompatibilityWarnings() : []

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Equipment Selection
        </CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeTab === "individual" ? "default" : "outline"}
            onClick={() => setActiveTab("individual")}
            className="text-xs"
          >
            Individual
          </Button>
          <Button
            size="sm"
            variant={activeTab === "sets" ? "default" : "outline"}
            onClick={() => setActiveTab("sets")}
            className="text-xs"
          >
            Equipment Sets
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeTab === "individual" ? (
          <div className="space-y-3">
            {equipment.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2 bg-gray-700/50 rounded-md">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedEquipmentIds.includes(item.id)}
                    onCheckedChange={() => toggleEquipment(item.id)}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white">{item.name}</span>
                      {item.settings.isFavorite && <Star className="w-3 h-3 text-yellow-400 fill-current" />}
                    </div>
                    <span className="text-xs text-gray-400">
                      {item.brand} {item.model}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={`text-xs ${
                      item.condition === "excellent"
                        ? "bg-green-600"
                        : item.condition === "good"
                          ? "bg-blue-600"
                          : item.condition === "fair"
                            ? "bg-yellow-600"
                            : "bg-red-600"
                    }`}
                  >
                    {item.condition}
                  </Badge>
                  <Badge variant="outline" className="border-gray-500 text-gray-300 text-xs">
                    {item.type}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {equipmentSets.map((set) => (
              <div key={set.id} className="p-3 bg-gray-700/50 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">{set.name}</span>
                    {set.isDefault && <Badge className="bg-purple-600 text-white text-xs">Default</Badge>}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => selectEquipmentSet(set)}
                    className="bg-purple-600 hover:bg-purple-700 text-xs"
                  >
                    Select Set
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-2">{set.purpose}</p>
                <div className="flex flex-wrap gap-1">
                  {set.equipmentIds.map((id) => {
                    const item = equipment.find((eq) => eq.id === id)
                    return item ? (
                      <Badge key={id} variant="outline" className="border-gray-500 text-gray-300 text-xs">
                        {item.name}
                      </Badge>
                    ) : null
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedEquipment.length > 0 && (
          <div className="border-t border-gray-600 pt-4">
            <h4 className="text-sm text-white mb-2">Selected Equipment ({selectedEquipment.length})</h4>
            <div className="flex flex-wrap gap-1 mb-3">
              {selectedEquipment.map((item) => (
                <Badge key={item.id} className="bg-blue-600 text-white text-xs">
                  {item.name}
                </Badge>
              ))}
            </div>

            {compatibilityWarnings.length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-yellow-400 font-medium">Compatibility Warnings</span>
                </div>
                <ul className="text-xs text-yellow-300 space-y-1">
                  {compatibilityWarnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {compatibilityWarnings.length === 0 && showCompatibilityCheck && (
              <div className="bg-green-900/20 border border-green-600/30 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400">Equipment selection looks good!</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
