"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  X,
  Plus,
  Settings,
  Wrench,
  Star,
  Camera,
  TelescopeIcon,
  Filter,
  Eye,
  Cpu,
  Clock,
  Edit,
  Trash2,
  Search,
} from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import type {
  Equipment,
  MaintenanceRecord,
  EquipmentSet,
  EquipmentType,
  EquipmentCondition,
  MaintenanceType,
} from "../../../types/telescope-types"

export function EquipmentManager() {
  const {
    showEquipmentManager,
    setShowEquipmentManager,
    equipment,
    setEquipment,
    maintenanceRecords,
    setMaintenanceRecords,
    equipmentSets,
    setEquipmentSets,
    addStatusAlert,
  } = useTelescopeContext()

  const [activeTab, setActiveTab] = useState("equipment")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [showAddEquipment, setShowAddEquipment] = useState(false)
  const [showAddMaintenance, setShowAddMaintenance] = useState(false)
  const [showAddSet, setShowAddSet] = useState(false)

  // Equipment form state
  const [newEquipment, setNewEquipment] = useState<Partial<Equipment>>({
    name: "",
    type: "telescope",
    brand: "",
    model: "",
    condition: "excellent",
    specifications: {},
    compatibility: {},
    location: { storage: "", isPortable: true },
    usage: { totalSessions: 0, totalHours: 0, averageRating: 0 },
    maintenance: {},
    settings: { isFavorite: false, isActive: false },
  })

  // Maintenance form state
  const [newMaintenance, setNewMaintenance] = useState<Partial<MaintenanceRecord>>({
    type: "cleaning",
    description: "",
    performedBy: "",
    beforeCondition: "good",
    afterCondition: "excellent",
  })

  // Equipment set form state
  const [newSet, setNewSet] = useState<Partial<EquipmentSet>>({
    name: "",
    description: "",
    purpose: "",
    equipmentIds: [],
    isDefault: false,
  })

  const getEquipmentIcon = (type: EquipmentType) => {
    switch (type) {
      case "telescope":
        return <TelescopeIcon className="w-4 h-4" />
      case "camera":
        return <Camera className="w-4 h-4" />
      case "filter":
        return <Filter className="w-4 h-4" />
      case "eyepiece":
        return <Eye className="w-4 h-4" />
      case "mount":
        return <Settings className="w-4 h-4" />
      case "focuser":
        return <Cpu className="w-4 h-4" />
      default:
        return <Settings className="w-4 h-4" />
    }
  }

  const getConditionColor = (condition: EquipmentCondition) => {
    switch (condition) {
      case "excellent":
        return "bg-green-600"
      case "good":
        return "bg-blue-600"
      case "fair":
        return "bg-yellow-600"
      case "poor":
        return "bg-orange-600"
      case "needs_repair":
        return "bg-red-600"
      default:
        return "bg-gray-600"
    }
  }

  const filteredEquipment = equipment.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.model.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const addEquipment = () => {
    if (!newEquipment.name || !newEquipment.brand || !newEquipment.model) return

    const equipment: Equipment = {
      id: `eq-${Date.now()}`,
      name: newEquipment.name,
      type: newEquipment.type || "telescope",
      brand: newEquipment.brand,
      model: newEquipment.model,
      serialNumber: newEquipment.serialNumber,
      purchaseDate: newEquipment.purchaseDate,
      purchasePrice: newEquipment.purchasePrice,
      condition: newEquipment.condition || "excellent",
      description: newEquipment.description,
      specifications: newEquipment.specifications || {},
      compatibility: newEquipment.compatibility || {},
      location: newEquipment.location || { storage: "", isPortable: true },
      usage: { totalSessions: 0, totalHours: 0, averageRating: 0 },
      maintenance: {},
      settings: { isFavorite: false, isActive: false },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }

    setEquipment((prev) => [...prev, equipment])
    setNewEquipment({
      name: "",
      type: "telescope",
      brand: "",
      model: "",
      condition: "excellent",
      specifications: {},
      compatibility: {},
      location: { storage: "", isPortable: true },
      usage: { totalSessions: 0, totalHours: 0, averageRating: 0 },
      maintenance: {},
      settings: { isFavorite: false, isActive: false },
    })
    setShowAddEquipment(false)

    addStatusAlert({
      type: "success",
      title: "Equipment Added",
      message: `${equipment.name} has been added to your equipment list`,
    })
  }

  const addMaintenanceRecord = () => {
    if (!selectedEquipment || !newMaintenance.description) return

    const record: MaintenanceRecord = {
      id: `maint-${Date.now()}`,
      equipmentId: selectedEquipment.id,
      type: newMaintenance.type || "cleaning",
      date: new Date(),
      description: newMaintenance.description,
      cost: newMaintenance.cost,
      performedBy: newMaintenance.performedBy || "User",
      nextDueDate: newMaintenance.nextDueDate,
      notes: newMaintenance.notes,
      beforeCondition: newMaintenance.beforeCondition || "good",
      afterCondition: newMaintenance.afterCondition || "excellent",
    }

    setMaintenanceRecords((prev) => [...prev, record])

    // Update equipment condition and last maintenance date
    setEquipment((prev) =>
      prev.map((eq) =>
        eq.id === selectedEquipment.id
          ? {
              ...eq,
              condition: record.afterCondition,
              maintenance: {
                ...eq.maintenance,
                lastMaintenance: new Date(),
                nextMaintenance: record.nextDueDate,
              },
              metadata: {
                ...eq.metadata,
                updatedAt: new Date(),
              },
            }
          : eq,
      ),
    )

    setNewMaintenance({
      type: "cleaning",
      description: "",
      performedBy: "",
      beforeCondition: "good",
      afterCondition: "excellent",
    })
    setShowAddMaintenance(false)

    addStatusAlert({
      type: "success",
      title: "Maintenance Recorded",
      message: `Maintenance record added for ${selectedEquipment.name}`,
    })
  }

  const deleteEquipment = (id: string) => {
    setEquipment((prev) => prev.filter((eq) => eq.id !== id))
    setMaintenanceRecords((prev) => prev.filter((rec) => rec.equipmentId !== id))

    addStatusAlert({
      type: "info",
      title: "Equipment Removed",
      message: "Equipment has been removed from your collection",
    })
  }

  if (!showEquipmentManager) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Equipment Manager
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEquipmentManager(false)}
            className="h-8 w-8 p-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3 bg-gray-700 mx-6 mt-4">
              <TabsTrigger value="equipment">Equipment</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
              <TabsTrigger value="sets">Equipment Sets</TabsTrigger>
            </TabsList>

            <TabsContent value="equipment" className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search equipment..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                  <Badge variant="outline" className="border-blue-400 text-blue-400">
                    {filteredEquipment.length} items
                  </Badge>
                </div>
                <Button onClick={() => setShowAddEquipment(true)} className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Equipment
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEquipment.map((item) => (
                  <Card key={item.id} className="bg-gray-700 border-gray-600 hover:border-gray-500 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getEquipmentIcon(item.type)}
                          <div>
                            <CardTitle className="text-white text-sm">{item.name}</CardTitle>
                            <p className="text-xs text-gray-400">
                              {item.brand} {item.model}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.settings.isFavorite && <Star className="w-4 h-4 text-yellow-400 fill-current" />}
                          {item.settings.isActive && <div className="w-2 h-2 bg-green-400 rounded-full" />}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Condition</span>
                        <Badge className={`${getConditionColor(item.condition)} text-white text-xs`}>
                          {item.condition}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Usage</span>
                        <span className="text-xs text-white">{item.usage.totalSessions} sessions</span>
                      </div>

                      {item.maintenance.nextMaintenance && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-yellow-400" />
                          <span className="text-xs text-yellow-400">
                            Maintenance due: {item.maintenance.nextMaintenance.toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedEquipment(item)}
                          className="flex-1 border-gray-600 text-white hover:bg-gray-600"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteEquipment(item.id)}
                          className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Add Equipment Modal */}
              {showAddEquipment && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
                  <Card className="bg-gray-800 border-gray-700 w-full max-w-md max-h-[80vh] overflow-y-auto">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        Add Equipment
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAddEquipment(false)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Name</label>
                        <Input
                          value={newEquipment.name || ""}
                          onChange={(e) => setNewEquipment((prev) => ({ ...prev, name: e.target.value }))}
                          className="bg-gray-700 border-gray-600 text-white"
                          placeholder="Equipment name"
                        />
                      </div>

                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Type</label>
                        <select
                          value={newEquipment.type || "telescope"}
                          onChange={(e) =>
                            setNewEquipment((prev) => ({ ...prev, type: e.target.value as EquipmentType }))
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
                        >
                          <option value="telescope">Telescope</option>
                          <option value="mount">Mount</option>
                          <option value="camera">Camera</option>
                          <option value="eyepiece">Eyepiece</option>
                          <option value="filter">Filter</option>
                          <option value="focuser">Focuser</option>
                          <option value="guide_scope">Guide Scope</option>
                          <option value="guide_camera">Guide Camera</option>
                          <option value="accessory">Accessory</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">Brand</label>
                          <Input
                            value={newEquipment.brand || ""}
                            onChange={(e) => setNewEquipment((prev) => ({ ...prev, brand: e.target.value }))}
                            className="bg-gray-700 border-gray-600 text-white"
                            placeholder="Brand"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">Model</label>
                          <Input
                            value={newEquipment.model || ""}
                            onChange={(e) => setNewEquipment((prev) => ({ ...prev, model: e.target.value }))}
                            className="bg-gray-700 border-gray-600 text-white"
                            placeholder="Model"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Condition</label>
                        <select
                          value={newEquipment.condition || "excellent"}
                          onChange={(e) =>
                            setNewEquipment((prev) => ({ ...prev, condition: e.target.value as EquipmentCondition }))
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
                        >
                          <option value="excellent">Excellent</option>
                          <option value="good">Good</option>
                          <option value="fair">Fair</option>
                          <option value="poor">Poor</option>
                          <option value="needs_repair">Needs Repair</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Description</label>
                        <Textarea
                          value={newEquipment.description || ""}
                          onChange={(e) => setNewEquipment((prev) => ({ ...prev, description: e.target.value }))}
                          className="bg-gray-700 border-gray-600 text-white resize-none"
                          rows={3}
                          placeholder="Equipment description..."
                        />
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button onClick={addEquipment} className="flex-1 bg-green-600 hover:bg-green-700">
                          Add Equipment
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowAddEquipment(false)}
                          className="flex-1 border-gray-600 text-white hover:bg-gray-700"
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="maintenance" className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Maintenance Records</h3>
                <Button
                  onClick={() => setShowAddMaintenance(true)}
                  disabled={!selectedEquipment}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Wrench className="w-4 h-4 mr-2" />
                  Add Maintenance
                </Button>
              </div>

              {!selectedEquipment ? (
                <div className="text-center py-8">
                  <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-400">Select equipment from the Equipment tab to view maintenance records</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Card className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <CardTitle className="text-white text-sm">
                        {selectedEquipment.name} - Maintenance History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {maintenanceRecords
                          .filter((record) => record.equipmentId === selectedEquipment.id)
                          .sort((a, b) => b.date.getTime() - a.date.getTime())
                          .map((record) => (
                            <div key={record.id} className="bg-gray-600 rounded-md p-3">
                              <div className="flex items-center justify-between mb-2">
                                <Badge className="bg-blue-600 text-white">{record.type}</Badge>
                                <span className="text-xs text-gray-300">{record.date.toLocaleDateString()}</span>
                              </div>
                              <p className="text-sm text-white mb-2">{record.description}</p>
                              <div className="flex items-center gap-4 text-xs text-gray-400">
                                <span>By: {record.performedBy}</span>
                                {record.cost && <span>Cost: ${record.cost}</span>}
                                <span>
                                  {record.beforeCondition} → {record.afterCondition}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Add Maintenance Modal */}
              {showAddMaintenance && selectedEquipment && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
                  <Card className="bg-gray-800 border-gray-700 w-full max-w-md">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        Add Maintenance Record
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAddMaintenance(false)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Maintenance Type</label>
                        <select
                          value={newMaintenance.type || "cleaning"}
                          onChange={(e) =>
                            setNewMaintenance((prev) => ({ ...prev, type: e.target.value as MaintenanceType }))
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
                        >
                          <option value="cleaning">Cleaning</option>
                          <option value="collimation">Collimation</option>
                          <option value="calibration">Calibration</option>
                          <option value="repair">Repair</option>
                          <option value="upgrade">Upgrade</option>
                          <option value="inspection">Inspection</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm text-gray-300 mb-2 block">Description</label>
                        <Textarea
                          value={newMaintenance.description || ""}
                          onChange={(e) => setNewMaintenance((prev) => ({ ...prev, description: e.target.value }))}
                          className="bg-gray-700 border-gray-600 text-white resize-none"
                          rows={3}
                          placeholder="Describe the maintenance performed..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">Before Condition</label>
                          <select
                            value={newMaintenance.beforeCondition || "good"}
                            onChange={(e) =>
                              setNewMaintenance((prev) => ({
                                ...prev,
                                beforeCondition: e.target.value as EquipmentCondition,
                              }))
                            }
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
                          >
                            <option value="excellent">Excellent</option>
                            <option value="good">Good</option>
                            <option value="fair">Fair</option>
                            <option value="poor">Poor</option>
                            <option value="needs_repair">Needs Repair</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm text-gray-300 mb-2 block">After Condition</label>
                          <select
                            value={newMaintenance.afterCondition || "excellent"}
                            onChange={(e) =>
                              setNewMaintenance((prev) => ({
                                ...prev,
                                afterCondition: e.target.value as EquipmentCondition,
                              }))
                            }
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white"
                          >
                            <option value="excellent">Excellent</option>
                            <option value="good">Good</option>
                            <option value="fair">Fair</option>
                            <option value="poor">Poor</option>
                            <option value="needs_repair">Needs Repair</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button onClick={addMaintenanceRecord} className="flex-1 bg-blue-600 hover:bg-blue-700">
                          Add Record
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowAddMaintenance(false)}
                          className="flex-1 border-gray-600 text-white hover:bg-gray-700"
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sets" className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Equipment Sets</h3>
                <Button onClick={() => setShowAddSet(true)} className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Set
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {equipmentSets.map((set) => (
                  <Card key={set.id} className="bg-gray-700 border-gray-600">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm">{set.name}</CardTitle>
                        {set.isDefault && <Badge className="bg-purple-600 text-white">Default</Badge>}
                      </div>
                      <p className="text-xs text-gray-400">{set.purpose}</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-gray-300">{set.description}</p>

                      <div className="space-y-2">
                        <span className="text-xs text-gray-400">Equipment ({set.equipmentIds.length} items):</span>
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

                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Used {set.timesUsed} times</span>
                        {set.lastUsed && <span>Last: {set.lastUsed.toLocaleDateString()}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
