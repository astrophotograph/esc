"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, Database, Save, Upload, Trash2, Download, HardDrive, AlertTriangle, Check, Info } from "lucide-react"
import { useTelescopeContext } from "../../../context/TelescopeContext"
import {
  clearAllStoredData,
  exportStoredData,
  importStoredData,
  getStorageUsage,
  STORAGE_KEYS,
} from "../../../utils/storage-utils"

export function DataManagementSettings() {
  const {
    showDataManagementSettings,
    setShowDataManagementSettings,
    addStatusAlert,
    setObservationLog,
    setPastSessions,
    setPlannedSessions,
    setNotificationHistory,
    setObservingLocations,
  } = useTelescopeContext()

  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [storageSize, setStorageSize] = useState(getStorageUsage())

  // Format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // Export all data to a JSON file
  const handleExport = () => {
    setIsExporting(true)

    try {
      const jsonData = exportStoredData()
      const blob = new Blob([jsonData], { type: "application/json" })
      const url = URL.createObjectURL(blob)

      // Create a download link and trigger it
      const a = document.createElement("a")
      a.href = url
      a.download = `telescope-data-${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()

      // Clean up
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      addStatusAlert({
        type: "success",
        title: "Data Exported",
        message: "All data has been exported successfully",
      })
    } catch (error) {
      console.error("Error exporting data:", error)
      addStatusAlert({
        type: "error",
        title: "Export Failed",
        message: "There was an error exporting your data",
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Import data from a JSON file
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string
        const success = importStoredData(jsonData)

        if (success) {
          addStatusAlert({
            type: "success",
            title: "Data Imported",
            message: "Data has been imported successfully. Reload the page to see changes.",
          })

          // Refresh storage size
          setStorageSize(getStorageUsage())
        } else {
          addStatusAlert({
            type: "error",
            title: "Import Failed",
            message: "The data format is incompatible or corrupted",
          })
        }
      } catch (error) {
        console.error("Error importing data:", error)
        addStatusAlert({
          type: "error",
          title: "Import Failed",
          message: "There was an error importing your data",
        })
      } finally {
        setIsImporting(false)
      }
    }

    reader.readAsText(file)
  }

  // Clear all stored data
  const handleClearData = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }

    try {
      clearAllStoredData()

      // Reset state
      setObservationLog([])
      setPastSessions([])
      setPlannedSessions([])
      setNotificationHistory([])
      setObservingLocations([])

      addStatusAlert({
        type: "success",
        title: "Data Cleared",
        message: "All stored data has been cleared successfully",
      })

      // Refresh storage size
      setStorageSize(0)

      // Reset confirmation
      setConfirmClear(false)
    } catch (error) {
      console.error("Error clearing data:", error)
      addStatusAlert({
        type: "error",
        title: "Clear Failed",
        message: "There was an error clearing your data",
      })
    }
  }

  // Get counts of stored items
  const getStoredCounts = () => {
    try {
      const observations = JSON.parse(localStorage.getItem(STORAGE_KEYS.OBSERVATIONS) || "[]")
      const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || "[]")
      const plannedSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.PLANNED_SESSIONS) || "[]")
      const locations = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCATIONS) || "[]")

      return {
        observations: observations.length,
        sessions: sessions.length,
        plannedSessions: plannedSessions.length,
        locations: locations.length,
      }
    } catch (error) {
      return {
        observations: 0,
        sessions: 0,
        plannedSessions: 0,
        locations: 0,
      }
    }
  }

  const counts = getStoredCounts()

  if (!showDataManagementSettings) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Database className="w-5 h-5" />
            Data Management
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDataManagementSettings(false)}
            className="h-8 w-8 p-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Storage Usage */}
          <Card className="bg-gray-700 border-gray-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-400" />
                Storage Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Total Storage Used</span>
                <Badge variant="outline" className="border-blue-400 text-blue-400">
                  {formatBytes(storageSize)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Observations</span>
                  <span className="text-white">{counts.observations}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Sessions</span>
                  <span className="text-white">{counts.sessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Planned Sessions</span>
                  <span className="text-white">{counts.plannedSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Locations</span>
                  <span className="text-white">{counts.locations}</span>
                </div>
              </div>

              <div className="text-xs text-gray-400">
                Data is stored locally in your browser. The browser's storage limit is typically around 5-10 MB.
              </div>
            </CardContent>
          </Card>

          {/* Export Data */}
          <Card className="bg-gray-700 border-gray-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Download className="w-4 h-4 text-green-400" />
                Export Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-gray-300">
                Export all your data to a JSON file that you can save as a backup or transfer to another device.
              </div>

              <Button onClick={handleExport} disabled={isExporting} className="w-full bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />
                {isExporting ? "Exporting..." : "Export All Data"}
              </Button>

              <div className="text-xs text-gray-400">
                The exported file will contain all your observations, sessions, locations, and settings.
              </div>
            </CardContent>
          </Card>

          {/* Import Data */}
          <Card className="bg-gray-700 border-gray-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-yellow-400" />
                Import Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-gray-300">Import data from a previously exported JSON file.</div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => document.getElementById("file-upload")?.click()}
                  disabled={isImporting}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isImporting ? "Importing..." : "Select File"}
                </Button>
                <input id="file-upload" type="file" accept=".json" onChange={handleImport} className="hidden" />
              </div>

              <div className="text-xs text-gray-400 flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Importing data will merge with your existing data. You may need to reload the page after import to see
                  all changes.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Clear Data */}
          <Card className="bg-gray-700 border-gray-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-400" />
                Clear Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-gray-300">
                Clear all stored data from your browser. This action cannot be undone.
              </div>

              {confirmClear ? (
                <div className="space-y-3">
                  <div className="bg-red-900/20 border border-red-600/30 rounded-md p-3 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-white mb-1">Are you sure?</h4>
                      <p className="text-sm text-gray-300">
                        This will permanently delete all your observations, sessions, locations, and settings. This
                        action cannot be undone.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleClearData} className="flex-1 bg-red-600 hover:bg-red-700">
                      <Check className="w-4 h-4 mr-2" />
                      Yes, Clear All Data
                    </Button>
                    <Button
                      onClick={() => setConfirmClear(false)}
                      variant="outline"
                      className="flex-1 border-gray-600 text-white hover:bg-gray-700"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={handleClearData} className="w-full bg-red-600 hover:bg-red-700">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Data
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
