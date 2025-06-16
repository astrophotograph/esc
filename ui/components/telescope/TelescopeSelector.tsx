"use client"

import { useEffect } from "react"
import { Telescope as TelescopeIcon, ChevronDown, Wifi, WifiOff, AlertTriangle, Settings, RefreshCw, Cloud, MapPin, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { useTelescopeContext } from "@/context/TelescopeContext"
import type { TelescopeInfo } from "@/types/telescope-types"

const getStatusIcon = (status: TelescopeInfo["status"]) => {
  switch (status) {
    case "online":
      return <Wifi className="w-4 h-4 text-green-500" />
    case "offline":
      return <WifiOff className="w-4 h-4 text-red-500" />
    case "maintenance":
      return <Settings className="w-4 h-4 text-blue-500" />
    case "error":
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />
    default:
      return <WifiOff className="w-4 h-4 text-gray-500" />
  }
}

const getStatusColor = (status: TelescopeInfo["status"]) => {
  switch (status) {
    case "online":
      return "bg-green-500 hover:bg-green-600"
    case "offline":
      return "bg-red-500 hover:bg-red-600"
    case "maintenance":
      return "bg-blue-500 hover:bg-blue-600"
    case "error":
      return "bg-yellow-500 hover:bg-yellow-600"
    default:
      return "bg-gray-500 hover:bg-gray-600"
  }
}

const getStatusText = (status: TelescopeInfo["status"]) => {
  switch (status) {
    case "online":
      return "Online"
    case "offline":
      return "Offline"
    case "maintenance":
      return "Maintenance"
    case "error":
      return "Error"
    default:
      return "Unknown"
  }
}

const getTelescopeDisplayName = (telescope: TelescopeInfo) => {
  if (telescope.product_model) {
    return telescope.name ? `${telescope.product_model} - ${telescope.name}` : telescope.product_model
  }
  if (telescope.name) {
    return telescope.name
  }
  return telescope.host
}

export function TelescopeSelector() {
  const {
    telescopes,
    currentTelescope,
    isLoadingTelescopes,
    telescopeError,
    fetchTelescopes,
    selectTelescope,
  } = useTelescopeContext()

  useEffect(() => {
    fetchTelescopes()
    // Set up periodic refresh every 30 seconds to update telescope status
    const interval = setInterval(fetchTelescopes, 30000)
    return () => clearInterval(interval)
  }, [])

  if (isLoadingTelescopes && (telescopes?.length || 0) === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Loading telescopes...</span>
      </div>
    )
  }

  if (telescopeError && telescopes.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <span>Error loading telescopes</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTelescopes}
          className="border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>
    )
  }

  if ((telescopes?.length ?? 0) === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
          <TelescopeIcon className="w-4 h-4" />
          <span>No telescopes available</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTelescopes}
          className="border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center gap-2 min-w-[220px] justify-between border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
          >
            <div className="flex items-center gap-2 flex-1">
              <TelescopeIcon className="w-4 h-4" />
              <span className="truncate">
                {currentTelescope ? getTelescopeDisplayName(currentTelescope) : "Select Telescope"}
              </span>
              {currentTelescope && (
                <div className="flex items-center gap-1 ml-auto">
                  {currentTelescope.is_remote && (
                    <Cloud className="w-3 h-3 text-blue-400" title="Remote telescope" />
                  )}
                  {getStatusIcon(currentTelescope.status)}
                </div>
              )}
            </div>
            <ChevronDown className="w-4 h-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[480px] bg-gray-800 border-gray-700">
          <DropdownMenuLabel className="text-gray-300 flex items-center justify-between">
            <span>Available Telescopes</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchTelescopes}
              className="h-6 w-6 p-0 hover:bg-gray-700"
              disabled={isLoadingTelescopes}
            >
              <RefreshCw className={`w-3 h-3 text-gray-400 ${isLoadingTelescopes ? 'animate-spin' : ''}`} />
            </Button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-700" />

          {telescopes.map((telescope) => (
            <DropdownMenuItem
              key={telescope.id}
              onClick={() => selectTelescope(telescope)}
              className="flex items-center justify-between p-3 hover:bg-gray-700 focus:bg-gray-700 cursor-pointer"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{getTelescopeDisplayName(telescope)}</span>
                    {telescope.is_remote && (
                      <Cloud className="w-3 h-3 text-blue-400" title="Remote telescope" />
                    )}
                    {getStatusIcon(telescope.status)}
                    {currentTelescope?.id === telescope.id && (
                      <Badge variant="secondary" className="text-xs bg-blue-600 text-white">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">{telescope.type || 'Unknown Type'}</span>
                    {telescope.location && (
                      <>
                        <span className="text-gray-500">•</span>
                        <MapPin className="w-3 h-3 text-gray-500" />
                        <span className="text-gray-500 truncate max-w-[200px]">{telescope.location}</span>
                      </>
                    )}
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-500">{telescope.host}:{telescope.port}</span>
                  </div>
                  {telescope.ssid && (
                    <div className="flex items-center gap-2 text-xs">
                      <Radio className="w-3 h-3 text-gray-500" />
                      <span className="text-gray-500 truncate max-w-[200px]">{telescope.ssid}</span>
                    </div>
                  )}
                  {telescope.description && (
                    <span className="text-xs text-gray-500 truncate max-w-[350px]">
                      {telescope.description}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 ml-2">
                <Badge
                  variant="secondary"
                  className={`text-xs ${getStatusColor(telescope.status)} text-white border-0`}
                >
                  {getStatusText(telescope.status)}
                </Badge>
                {telescope.isConnected !== undefined && (
                  <span className={`text-xs ${telescope.isConnected ? 'text-green-400' : 'text-red-400'}`}>
                    {telescope.isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          ))}

          {telescopes.length === 0 && (
            <DropdownMenuItem disabled className="p-3 text-gray-500">
              No telescopes found
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status indicator */}
      {currentTelescope && (
        <div className="flex items-center gap-1 text-xs">
          <div className={`w-2 h-2 rounded-full ${getStatusColor(currentTelescope.status).split(' ')[0]}`} />
          <span className="text-gray-400">{getStatusText(currentTelescope.status)}</span>
        </div>
      )}
    </div>
  )
}
