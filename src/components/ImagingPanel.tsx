import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Square, RotateCcw, Clock, Camera, Layers } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { Label } from './ui/label'
import { invoke } from '../services/api'
import { useTelescopeStore } from '../stores'

interface StackingStatus {
  success: boolean
  is_stacking: boolean
  stacked_frames: number
  total_exposure_ms: number
  target_name: string | null
  stage?: string
}

interface ImagingPanelProps {
  compact?: boolean
}

export function ImagingPanel({ compact = false }: ImagingPanelProps) {
  const { currentTelescopeId, telescopes, addActivity } = useTelescopeStore()

  const [isStacking, setIsStacking] = useState(false)
  const [stackedFrames, setStackedFrames] = useState(0)
  const [totalExposureMs, setTotalExposureMs] = useState(0)
  const [targetName, setTargetName] = useState<string | null>(null)
  const [stage, setStage] = useState<string>('Idle')
  const [isLoading, setIsLoading] = useState(false)
  const [restartOnStart, setRestartOnStart] = useState(false)

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const currentTelescope = telescopes.find(t => t.id === currentTelescopeId)
  const isConnected = currentTelescope?.status === 'connected'
  const isSeestar = currentTelescope?.protocol === 'seestar' || !currentTelescope?.protocol

  // Poll for stacking status
  const pollStatus = useCallback(async () => {
    if (!currentTelescopeId || !isConnected) return

    try {
      const result = await invoke<StackingStatus>('telescope_get_stacking_status', {
        telescopeId: currentTelescopeId
      })

      if (result.success) {
        setIsStacking(result.is_stacking)
        setStackedFrames(result.stacked_frames)
        setTotalExposureMs(result.total_exposure_ms)
        setTargetName(result.target_name)
        setStage(result.stage || 'Idle')
      }
    } catch (error) {
      console.error('Failed to get stacking status:', error)
    }
  }, [currentTelescopeId, isConnected])

  // Start polling when connected
  useEffect(() => {
    if (isConnected && isSeestar) {
      // Initial poll
      pollStatus()

      // Poll every 2 seconds
      pollIntervalRef.current = setInterval(pollStatus, 2000)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isConnected, isSeestar, pollStatus])

  const handleStartStack = useCallback(async () => {
    if (!currentTelescopeId) return

    setIsLoading(true)
    try {
      const result = await invoke<{ success: boolean; error?: string }>('telescope_start_stack', {
        telescopeId: currentTelescopeId,
        restart: restartOnStart
      })

      if (result.success) {
        setIsStacking(true)
        addActivity(currentTelescopeId, 'success', `Stacking started${restartOnStart ? ' (restart)' : ''}`)
      } else {
        throw new Error(result.error || 'Failed to start stacking')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start stacking'
      addActivity(currentTelescopeId, 'error', message)
    } finally {
      setIsLoading(false)
    }
  }, [currentTelescopeId, restartOnStart, addActivity])

  const handleStopStack = useCallback(async () => {
    if (!currentTelescopeId) return

    setIsLoading(true)
    try {
      const result = await invoke<{ success: boolean; error?: string }>('telescope_stop_stack', {
        telescopeId: currentTelescopeId
      })

      if (result.success) {
        setIsStacking(false)
        addActivity(currentTelescopeId, 'info', `Stacking stopped at ${stackedFrames} frames`)
      } else {
        throw new Error(result.error || 'Failed to stop stacking')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop stacking'
      addActivity(currentTelescopeId, 'error', message)
    } finally {
      setIsLoading(false)
    }
  }, [currentTelescopeId, stackedFrames, addActivity])

  const formatExposureTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  if (!isConnected) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" />
            Imaging
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect to a telescope to start imaging
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!isSeestar) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" />
            Imaging
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Stacking is only supported on Seestar telescopes
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={compact ? 'border-0 shadow-none' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" />
            Imaging
          </CardTitle>
          <Badge variant={isStacking ? 'default' : 'secondary'}>
            {stage}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target Info */}
        {targetName && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Target:</span>
            <span className="font-medium">{targetName}</span>
          </div>
        )}

        {/* Stacking Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{stackedFrames}</p>
              <p className="text-xs text-muted-foreground">Frames</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{formatExposureTime(totalExposureMs)}</p>
              <p className="text-xs text-muted-foreground">Total Exposure</p>
            </div>
          </div>
        </div>

        {/* Restart Option */}
        {!isStacking && (
          <div className="flex items-center justify-between">
            <Label htmlFor="restart-stack" className="text-sm">
              Restart from scratch
            </Label>
            <Switch
              id="restart-stack"
              checked={restartOnStart}
              onCheckedChange={setRestartOnStart}
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {!isStacking ? (
            <Button
              onClick={handleStartStack}
              disabled={isLoading}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Stacking
            </Button>
          ) : (
            <Button
              onClick={handleStopStack}
              disabled={isLoading}
              variant="destructive"
              className="flex-1"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Stacking
            </Button>
          )}

          {isStacking && stackedFrames > 0 && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setRestartOnStart(true)
                handleStopStack()
              }}
              disabled={isLoading}
              title="Restart stacking"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Exposure Info */}
        {isStacking && (
          <p className="text-xs text-center text-muted-foreground">
            Each frame: 10s exposure
          </p>
        )}
      </CardContent>
    </Card>
  )
}
