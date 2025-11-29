import { Wifi, WifiOff, Activity, Radar, Server, PictureInPicture, Keyboard, Settings } from 'lucide-react'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useUIStore } from '../stores/uiStore'
import { ThemeToggle } from './ThemeToggle'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

export function EnhancedHeader() {
  const telescopes = useTelescopeStore(state => state.telescopes)
  const currentTelescopeId = useTelescopeStore(state => state.currentTelescopeId)

  const showPiP = useUIStore(state => state.showPiP)
  const togglePiP = useUIStore(state => state.togglePiP)
  const setShowKeyboardHelp = useUIStore(state => state.setShowKeyboardHelp)
  const setShowSettings = useUIStore(state => state.setShowSettings)

  const connectedCount = telescopes.filter(t => t.status === 'connected').length
  const totalCount = telescopes.length
  const currentTelescope = telescopes.find(t => t.id === currentTelescopeId)
  const isConnected = currentTelescope?.status === 'connected'

  return (
    <header className="border-b bg-card px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Logo and Title */}
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">EESC</h1>
            <p className="text-sm text-muted-foreground">Enhanced Equipment & Seestar Control</p>
          </div>

          {/* Status Indicators */}
          <div className="hidden md:flex items-center gap-3">
            {/* Connection Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background">
              {isConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-green-500">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Offline</span>
                </>
              )}
            </div>

            {/* Telescope Count */}
            {totalCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background">
                <Radar className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {connectedCount}/{totalCount}
                </span>
              </div>
            )}

            {/* Current Telescope Name */}
            {currentTelescope && (
              <Badge variant="secondary" className="px-3 py-1">
                <Activity className="h-3 w-3 mr-1.5" />
                {currentTelescope.name}
              </Badge>
            )}

            {/* Streaming Server Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background">
              <Server className="h-4 w-4 text-blue-500" />
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-sm font-medium text-muted-foreground">:8080</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <TooltipProvider>
          <div className="flex items-center gap-2">
            {/* PiP Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showPiP ? 'default' : 'ghost'}
                  size="sm"
                  onClick={togglePiP}
                  className="w-9 h-9 p-0"
                  disabled={!currentTelescopeId}
                >
                  <PictureInPicture className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Picture in Picture (Ctrl+P)</p>
              </TooltipContent>
            </Tooltip>

            {/* Keyboard Shortcuts */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKeyboardHelp(true)}
                  className="w-9 h-9 p-0"
                >
                  <Keyboard className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Keyboard Shortcuts (?)</p>
              </TooltipContent>
            </Tooltip>

            {/* Settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  className="w-9 h-9 p-0"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Settings (Ctrl+,)</p>
              </TooltipContent>
            </Tooltip>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </TooltipProvider>
      </div>
    </header>
  )
}
