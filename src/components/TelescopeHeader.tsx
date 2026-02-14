import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Wifi,
  WifiOff,
  ChevronDown,
  RefreshCw,
  Settings,
  AlertTriangle,
  MapPin,
  Radio,
  Battery,
  Thermometer,
  Gauge,
  Navigation,
  Compass,
  Search,
  Maximize2,
  Mountain,
  HelpCircle,
  Cpu,
  Move,
  Menu,
  PictureInPicture,
} from 'lucide-react'
import { invoke } from '../services/api'
import { useTelescopeStore, type TelescopeInfo, type TelescopeStatus } from '../stores/telescopeStore'
import { useUIStore } from '../stores/uiStore'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

// Helper functions for status display
const getStatusIcon = (status: TelescopeInfo['status']) => {
  switch (status) {
    case 'connected':
      return <Wifi className="w-4 h-4 text-green-500" />
    case 'connecting':
      return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
    case 'error':
      return <AlertTriangle className="w-4 h-4 text-red-500" />
    default:
      return <WifiOff className="w-4 h-4 text-muted-foreground" />
  }
}

const getStatusColor = (status: TelescopeInfo['status']) => {
  switch (status) {
    case 'connected':
      return 'bg-green-500 hover:bg-green-600 text-white'
    case 'connecting':
      return 'bg-yellow-500 hover:bg-yellow-600 text-white'
    case 'error':
      return 'bg-red-500 hover:bg-red-600 text-white'
    default:
      return 'bg-muted hover:bg-muted/80 text-muted-foreground'
  }
}

const getStatusText = (status: TelescopeInfo['status']) => {
  switch (status) {
    case 'connected':
      return 'Online'
    case 'connecting':
      return 'Connecting'
    case 'error':
      return 'Error'
    default:
      return 'Offline'
  }
}

const getTelescopeDisplayName = (telescope: TelescopeInfo) => {
  // Prefer user-defined friendly name
  if (telescope.friendlyName) {
    return telescope.friendlyName
  }
  if (telescope.product_model) {
    return telescope.name ? `${telescope.product_model} - ${telescope.name}` : telescope.product_model
  }
  if (telescope.name) {
    return telescope.name
  }
  return telescope.host
}

export function TelescopeHeader() {
  const status = useTelescopeStore((s): TelescopeStatus | null =>
    s.currentTelescopeId ? s.telescopeStatus[s.currentTelescopeId] ?? null : null
  )
  const [isSceneryMode, setIsSceneryMode] = useState(false)

  const {
    telescopes,
    currentTelescopeId,
    isDiscovering,
    setCurrentTelescope,
    mergeTelescopes,
    updateTelescope,
    setIsDiscovering,
    addActivity,
    getTelescopesBySection,
    toggleSectionCollapse,
  } = useTelescopeStore()

  const {
    setShowKeyboardHelp,
    setShowSettings,
    showTelescopeStatus,
    setShowTelescopeStatus,
    showTelescopeControls,
    setShowTelescopeControls,
    showPiP,
    togglePiP,
  } = useUIStore()

  const currentTelescope = telescopes.find((t) => t.id === currentTelescopeId)
  const isConnected = currentTelescope?.status === 'connected'

  // Use a ref to access current telescopes without triggering effect re-runs
  const telescopesRef = useRef(telescopes)
  telescopesRef.current = telescopes

  const currentTelescopeIdRef = useRef(currentTelescopeId)
  currentTelescopeIdRef.current = currentTelescopeId

  // Auto-discover telescopes on mount
  const fetchTelescopes = useCallback(async () => {
    setIsDiscovering(true)
    try {
      const result = await invoke<any[]>('discover_telescopes', {})
      const currentTelescopes = telescopesRef.current

      // Process discovered telescopes - merge with existing to preserve connection status
      const discovered = result.map((t) => {
        const id = t.serial_number || `${t.host}:${t.port}`
        // Check if telescope already exists and preserve its status
        const existing = currentTelescopes.find((existing) => existing.id === id)

        // Preserve 'connected' status, but reset stale 'connecting' to 'disconnected'
        // (handles case where app was closed during connection attempt)
        let status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
        if (existing?.status === 'connected') {
          status = 'connected'
        } else if (existing?.status === 'error') {
          status = 'error'
        }
        // 'connecting' and 'disconnected' both become 'disconnected'

        // Get protocol from discovery result, default based on port
        const protocol = t.protocol || (t.port === 4700 ? 'seestar' : 'alpaca')

        // Generate appropriate name based on protocol
        const defaultName = protocol === 'alpaca'
          ? `Alpaca ${t.host}`
          : `Seestar ${t.serial_number || t.host}`

        return {
          id,
          host: t.host,
          port: t.port,
          protocol: protocol as 'seestar' | 'alpaca',
          name: t.name || defaultName,
          serial_number: t.serial_number,
          product_model: t.product_model || (protocol === 'alpaca' ? 'Alpaca Server' : 'Seestar S30'),
          discovery_method: 'auto_discovery',
          status,
          error: existing?.error,
        }
      })

      if (discovered.length > 0) {
        mergeTelescopes(discovered)
        // Auto-select first telescope if none selected
        if (!currentTelescopeIdRef.current) {
          setCurrentTelescope(discovered[0].id)
        }
        // Only log on first discovery or when new telescopes found
        const newCount = discovered.filter(
          (d) => !currentTelescopes.some((t) => t.id === d.id)
        ).length
        if (newCount > 0 || currentTelescopes.length === 0) {
          addActivity(discovered[0].id, 'info', `Discovered ${discovered.length} telescope(s)`)
        }
      }
    } catch (error) {
      console.error('Discovery failed:', error)
      addActivity('system', 'error', `Discovery failed: ${error}`)
    } finally {
      setIsDiscovering(false)
    }
  }, [setIsDiscovering, mergeTelescopes, setCurrentTelescope, addActivity])

  // Auto-discover on mount and periodically
  useEffect(() => {
    fetchTelescopes()
    const interval = setInterval(fetchTelescopes, 60000) // Refresh every 60 seconds
    return () => clearInterval(interval)
  }, [fetchTelescopes])

  // Auto-connect to selected telescope
  const connectToTelescope = useCallback(async (telescope: TelescopeInfo) => {
    updateTelescope(telescope.id, { status: 'connecting' })
    try {
      // Pass host/port/protocol for manually added telescopes
      await invoke('connect_telescope', {
        telescopeId: telescope.id,
        host: telescope.host,
        port: telescope.port,
        protocol: telescope.protocol || 'seestar',
      })
      updateTelescope(telescope.id, { status: 'connected' })
      addActivity(telescope.id, 'success', 'Connected to telescope')
    } catch (error) {
      updateTelescope(telescope.id, { status: 'error', error: String(error) })
      addActivity(telescope.id, 'error', `Connection failed: ${error}`)
    }
  }, [updateTelescope, addActivity])

  // Select and connect to telescope
  const selectTelescope = useCallback((telescope: TelescopeInfo) => {
    setCurrentTelescope(telescope.id)
    // Connect if not already connected (handles 'disconnected', 'connecting' from stale state, or 'error')
    if (telescope.status !== 'connected') {
      connectToTelescope(telescope)
    }
  }, [setCurrentTelescope, connectToTelescope])

  // Reset view mode when switching telescopes
  useEffect(() => {
    setIsSceneryMode(false)
  }, [currentTelescopeId])

  const toggleSceneryMode = useCallback(async () => {
    if (!currentTelescopeId) {
      return
    }
    const nextMode = !isSceneryMode
    try {
      await invoke('telescope_set_view_mode', {
        telescopeId: currentTelescopeId,
        mode: nextMode ? 'scenery' : 'star',
      })
      setIsSceneryMode(nextMode)
      addActivity(currentTelescopeId, 'info', `View mode: ${nextMode ? 'scenery' : 'star'}`)
    } catch (error) {
      addActivity(currentTelescopeId, 'error', `Failed to set view mode: ${error}`)
    }
  }, [currentTelescopeId, isSceneryMode, addActivity])

  const formatBattery = (percent?: number) => {
    if (percent == null) return '--'
    return `${Math.round(percent)}%`
  }

  const formatTemp = (temp?: number) => {
    if (temp == null) return '--°C'
    return `${temp.toFixed(1)}°C`
  }

  return (
    <header className="flex items-center justify-between px-2 sm:px-4 py-2 bg-card border-b border-border gap-2">
      {/* Left Section - Telescope Selector */}
      <TooltipProvider>
        <div className="flex items-center gap-2 min-w-0 flex-shrink">
          {/* Telescope Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="flex items-center gap-2 min-w-0 sm:min-w-[180px] lg:min-w-[220px] justify-between"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-lg hidden sm:inline">🔭</span>
                  <span className="truncate font-medium text-sm sm:text-base">
                    {currentTelescope ? getTelescopeDisplayName(currentTelescope) : 'Select Telescope'}
                  </span>
                  {currentTelescope && (
                    <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                      {getStatusIcon(currentTelescope.status)}
                    </div>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 ml-1 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[min(480px,calc(100vw-2rem))]">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Available Telescopes</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(true)}
                    className="h-6 w-6 p-0 hover:bg-accent"
                    title="Manage Telescopes"
                  >
                    <Settings className="w-3 h-3 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchTelescopes}
                    className="h-6 w-6 p-0 hover:bg-accent"
                    disabled={isDiscovering}
                    title="Refresh Telescopes"
                  >
                    <RefreshCw className={`w-3 h-3 text-muted-foreground ${isDiscovering ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {telescopes.length === 0 ? (
                <DropdownMenuItem disabled className="p-3 text-muted-foreground">
                  {isDiscovering ? 'Discovering telescopes...' : 'No telescopes found'}
                </DropdownMenuItem>
              ) : (
                getTelescopesBySection().map(({ section, telescopes: sectionTelescopes }) => (
                  <div key={section?.id ?? 'unsectioned'}>
                    {section && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel
                          className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded"
                          onClick={() => toggleSectionCollapse(section.id)}
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${section.collapsed ? '-rotate-90' : ''}`} />
                          <span>{section.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{sectionTelescopes.length}</span>
                        </DropdownMenuLabel>
                      </>
                    )}
                    {(!section || !section.collapsed) && sectionTelescopes.map((telescope) => (
                      <DropdownMenuItem
                        key={telescope.id}
                        onClick={() => selectTelescope(telescope)}
                        className={`flex items-center justify-between p-3 hover:bg-accent focus:bg-accent cursor-pointer ${section ? 'ml-4' : ''}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{getTelescopeDisplayName(telescope)}</span>
                              {getStatusIcon(telescope.status)}
                              {currentTelescopeId === telescope.id && (
                                <Badge variant="secondary" className="text-xs bg-blue-600 text-white border-0">
                                  Active
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{telescope.product_model || telescope.protocol || 'Unknown'}</span>
                              {telescope.location && (
                                <>
                                  <span>•</span>
                                  <MapPin className="w-3 h-3" />
                                  <span>{telescope.location}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{telescope.host}:{telescope.port}</span>
                              {telescope.serial_number && (
                                <>
                                  <Radio className="w-3 h-3" />
                                  <span>{telescope.serial_number}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${getStatusColor(telescope.status)} border-0 flex-shrink-0`}
                        >
                          {getStatusText(telescope.status)}
                        </Badge>
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Connection Status - hidden on small screens */}
          {currentTelescope && (
            <div className="hidden md:flex items-center gap-2 text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-default">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(currentTelescope.status).split(' ')[0]}`} />
                    <span className="text-muted-foreground">{getStatusText(currentTelescope.status)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{currentTelescope.status === 'connected' ? 'Telescope is connected and ready' : 'Click to connect'}</p>
                </TooltipContent>
              </Tooltip>

              {isConnected && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  MJPEG
                </Badge>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>

      {/* Center Section - Status Indicators (hidden on small/medium screens) */}
      {isConnected && (
        <TooltipProvider>
          <div className="hidden xl:flex items-center gap-4 text-sm flex-shrink-0">
            {/* Battery */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Battery
                    className={`h-4 w-4 ${
                      (status?.batteryPercent ?? 0) > 50
                        ? 'text-green-500'
                        : (status?.batteryPercent ?? 0) > 20
                          ? 'text-yellow-500'
                          : 'text-red-500'
                    }`}
                  />
                  <span className="font-mono">{formatBattery(status?.batteryPercent)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Battery Level</TooltipContent>
            </Tooltip>

            {/* Temperature */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Thermometer className="h-4 w-4 text-orange-500" />
                  <span className="font-mono">{formatTemp(status?.temperatureC)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Temperature</TooltipContent>
            </Tooltip>

            {/* Gain */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Gauge className="h-4 w-4 text-purple-500" />
                  <span className="font-mono">
                    {status?.gain != null
                      ? status.gain
                      : status?.gainMode === 'auto'
                        ? 'AUTO'
                        : '--'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Camera Gain</TooltipContent>
            </Tooltip>

            {/* RA/Dec Position */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Compass className="h-4 w-4 text-cyan-500" />
                  <span className="font-mono text-xs">
                    {status?.ra != null ? `${(status.ra / 15).toFixed(2)}h` : '--'}
                    {' / '}
                    {status?.dec != null ? `${status.dec.toFixed(1)}°` : '--'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>RA / Dec (J2000)</TooltipContent>
            </Tooltip>

            {/* Tracking */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Navigation className="h-4 w-4" />
                  <span className={`font-mono ${status?.isTracking ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {status?.isTracking ? 'TRK' : 'OFF'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Tracking {status?.isTracking ? 'Enabled' : 'Disabled'}</TooltipContent>
            </Tooltip>

            {/* View State / Mode */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Compass className="h-4 w-4 text-cyan-500" />
                  <span className="font-mono">{status?.mountType ?? 'Alt-Az'}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>View State / Mode</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}

      {/* Right Section - Action Buttons */}
      <TooltipProvider>
        <div className="flex items-center gap-1">
          {/* Search */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search</TooltipContent>
          </Tooltip>

          {/* Refresh */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchTelescopes} disabled={isDiscovering}>
                <RefreshCw className={`h-4 w-4 ${isDiscovering ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>

          {/* Fullscreen */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fullscreen</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border mx-2" />

          {/* PiP Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showPiP ? 'default' : 'outline'}
                size="sm"
                onClick={togglePiP}
                className="gap-2"
              >
                <PictureInPicture className="h-4 w-4" />
                PiP
              </Button>
            </TooltipTrigger>
            <TooltipContent>Picture in Picture (Ctrl+P)</TooltipContent>
          </Tooltip>

          {/* Telescope Status Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showTelescopeStatus ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTelescopeStatus(!showTelescopeStatus)}
                className="gap-2"
              >
                <Cpu className="h-4 w-4" />
                Status
              </Button>
            </TooltipTrigger>
            <TooltipContent>Telescope Status Panel</TooltipContent>
          </Tooltip>

          {/* Telescope Controls Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showTelescopeControls ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTelescopeControls(!showTelescopeControls)}
                className="gap-2"
              >
                <Move className="h-4 w-4" />
                Controls
              </Button>
            </TooltipTrigger>
            <TooltipContent>Telescope Controls Panel</TooltipContent>
          </Tooltip>

          {/* Scenery */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isSceneryMode ? 'default' : 'outline'}
                size="sm"
                className="gap-2"
                disabled={!isConnected}
                onClick={toggleSceneryMode}
              >
                <Mountain className="h-4 w-4" />
                Scenery
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isSceneryMode ? 'Switch to star mode' : 'Switch to scenery mode'}
            </TooltipContent>
          </Tooltip>

          {/* Help */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKeyboardHelp(true)}
                className="gap-2"
              >
                <HelpCircle className="h-4 w-4" />
                Help
              </Button>
            </TooltipTrigger>
            <TooltipContent>Help (?)</TooltipContent>
          </Tooltip>

          {/* User/Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(true)}
                className="h-8 w-8"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          {/* Hamburger Menu - visible on small screens */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={fetchTelescopes} disabled={isDiscovering}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isDiscovering ? 'animate-spin' : ''}`} />
                Refresh Telescopes
              </DropdownMenuItem>

              <DropdownMenuItem>
                <Search className="h-4 w-4 mr-2" />
                Search
              </DropdownMenuItem>

              <DropdownMenuItem>
                <Maximize2 className="h-4 w-4 mr-2" />
                Fullscreen
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Panels</DropdownMenuLabel>

              <DropdownMenuItem onClick={() => setShowTelescopeStatus(!showTelescopeStatus)}>
                <Cpu className="h-4 w-4 mr-2" />
                {showTelescopeStatus ? '✓ ' : ''}Telescope Status
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setShowTelescopeControls(!showTelescopeControls)}>
                <Move className="h-4 w-4 mr-2" />
                {showTelescopeControls ? '✓ ' : ''}Telescope Controls
              </DropdownMenuItem>

              <DropdownMenuItem>
                <Mountain className="h-4 w-4 mr-2" />
                Scenery Mode
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setShowKeyboardHelp(true)}>
                <HelpCircle className="h-4 w-4 mr-2" />
                Help & Shortcuts
              </DropdownMenuItem>

              {/* Status info in hamburger menu for small screens */}
              {isConnected && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <div className="px-2 py-1.5 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Battery
                        className={`h-4 w-4 ${
                          (status?.batteryPercent ?? 0) > 50
                            ? 'text-green-500'
                            : (status?.batteryPercent ?? 0) > 20
                              ? 'text-yellow-500'
                              : 'text-red-500'
                        }`}
                      />
                      <span className="text-muted-foreground">Battery:</span>
                      <span className="font-mono">{formatBattery(status?.batteryPercent)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Thermometer className="h-4 w-4 text-orange-500" />
                      <span className="text-muted-foreground">Temp:</span>
                      <span className="font-mono">{formatTemp(status?.temperatureC)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Compass className="h-4 w-4 text-cyan-500" />
                      <span className="text-muted-foreground">Position:</span>
                      <span className="font-mono text-xs">
                        {status?.ra != null ? `${(status.ra / 15).toFixed(2)}h` : '--'}
                        {' / '}
                        {status?.dec != null ? `${status.dec.toFixed(1)}°` : '--'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4" />
                      <span className="text-muted-foreground">Tracking:</span>
                      <span className={`font-mono ${status?.isTracking ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {status?.isTracking ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </header>
  )
}
