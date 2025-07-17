"use client"

import {useEffect} from "react"
import {
  Telescope as TelescopeIcon,
  ChevronDown,
  Wifi,
  WifiOff,
  AlertTriangle,
  Settings,
  RefreshCw,
  Cloud,
  MapPin,
  Radio,
  Cog,
} from "lucide-react"
import {Button} from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {Badge} from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {useTelescopeContext} from "@/context/TelescopeContext"
import type {TelescopeInfo} from "@/types/telescope-types"

const getStatusIcon = (status: TelescopeInfo["status"]) => {
  switch (status) {
    case "online":
      return <Wifi className="w-4 h-4 text-green-500"/>
    case "offline":
      return <WifiOff className="w-4 h-4 text-red-500"/>
    case "maintenance":
      return <Settings className="w-4 h-4 text-blue-500"/>
    case "error":
      return <AlertTriangle className="w-4 h-4 text-yellow-500"/>
    default:
      return <WifiOff className="w-4 h-4 text-gray-500"/>
  }
}

const getStatusTooltip = (status: TelescopeInfo["status"]) => {
  switch (status) {
    case "online":
      return "Telescope is connected and ready for observations"
    case "offline":
      return "Telescope is not responding or disconnected"
    case "maintenance":
      return "Telescope is in maintenance mode - limited functionality"
    case "error":
      return "Telescope has encountered an error and needs attention"
    default:
      return "Telescope status unknown"
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
    setShowTelescopeManagement,
    connectionType,
  } = useTelescopeContext()

  useEffect(() => {
    fetchTelescopes()
    // Set up periodic refresh every 60 seconds to update telescope status
    // Reduced frequency to minimize potential switching issues
    const interval = setInterval(fetchTelescopes, 60000)
    return () => clearInterval(interval)
  }, [])

  if (isLoadingTelescopes && (telescopes?.length || 0) === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin"/>
        <span>Loading telescopes...</span>
      </div>
    )
  }

  if (telescopeError && telescopes.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4"/>
          <span>Error loading telescopes</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTelescopeManagement(true)}
          className="border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
          title="Add Telescope"
        >
          <Cog className="w-3 h-3"/>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTelescopes}
          className="border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3"/>
        </Button>
      </div>
    )
  }

  if ((telescopes?.length ?? 0) === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
          <TelescopeIcon className="w-4 h-4"/>
          <span>No telescopes available</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTelescopeManagement(true)}
          className="border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
          title="Add Telescope"
        >
          <Cog className="w-3 h-3"/>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTelescopes}
          className="border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3"/>
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center gap-2 min-w-[220px] justify-between border-gray-600 bg-gray-800 hover:bg-gray-700 text-white"
            data-tour="telescope-selector"
          >
            <div className="flex items-center gap-2 flex-1">
              <TelescopeIcon className="w-4 h-4"/>
              <span className="truncate">
                {currentTelescope ? getTelescopeDisplayName(currentTelescope) : "Select Telescope"}
              </span>
              {currentTelescope && (
                <div className="flex items-center gap-1 ml-auto">
                  {currentTelescope.is_remote && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Cloud className="w-3 h-3 text-blue-400"/>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Remote telescope - accessed via cloud connection</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex">
                        {getStatusIcon(currentTelescope.status)}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{getStatusTooltip(currentTelescope.status)}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
            <ChevronDown className="w-4 h-4 ml-1"/>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[480px] bg-gray-800 border-gray-700">
          <DropdownMenuLabel className="text-gray-300 flex items-center justify-between">
            <span>Available Telescopes</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTelescopeManagement(true)}
                className="h-6 w-6 p-0 hover:bg-gray-700"
                title="Manage Telescopes"
              >
                <Cog className="w-3 h-3 text-gray-400"/>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchTelescopes}
                className="h-6 w-6 p-0 hover:bg-gray-700"
                disabled={isLoadingTelescopes}
                title="Refresh Telescopes"
              >
                <RefreshCw className={`w-3 h-3 text-gray-400 ${isLoadingTelescopes ? 'animate-spin' : ''}`}/>
              </Button>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-700"/>

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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Cloud className="w-3 h-3 text-blue-400"/>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Remote telescope - accessed via cloud connection</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex">
                          {getStatusIcon(telescope.status)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{getStatusTooltip(telescope.status)}</p>
                      </TooltipContent>
                    </Tooltip>
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
                        <MapPin className="w-3 h-3 text-gray-500"/>
                        <span className="text-gray-500">{telescope.location}</span>
                      </>
                    )}
                    {/*<span className="text-gray-500">•</span>*/}
                    {/*<span className="text-gray-500">{telescope.host}:{telescope.port}</span>*/}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {telescope.host && (
                      <span className="text-xs text-gray-500">
                      {telescope.host}
                    </span>
                    )}
                    {telescope.ssid && (
                      <>
                        <Radio className="w-3 h-3 text-gray-500"/>
                        <span className="text-xs text-gray-500">
                         {telescope.ssid}
                        </span>
                      </>
                    )}
                  </div>
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
          <div className="flex items-center gap-2 text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-default">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(currentTelescope.status).split(' ')[0]}`}/>
                  <span className="text-gray-400">{getStatusText(currentTelescope.status)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{getStatusTooltip(currentTelescope.status)}</p>
              </TooltipContent>
            </Tooltip>
            {connectionType !== 'disconnected' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 cursor-default">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      connectionType === 'webrtc' ? 'bg-green-400' : 'bg-yellow-400'
                    }`}/>
                    <span className={`text-xs font-medium ${
                      connectionType === 'webrtc' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                    }`}>
                      {connectionType === 'webrtc' ? 'WebRTC' : 'MJPEG'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {connectionType === 'webrtc' 
                      ? 'High-quality WebRTC live video stream with low latency'
                      : 'MJPEG fallback stream - lower quality but more compatible'
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
