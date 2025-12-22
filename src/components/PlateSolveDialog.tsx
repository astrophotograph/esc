import { useState, useCallback, useEffect } from 'react'
import {
  Compass,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Target,
  RotateCw,
  Settings2,
  RefreshCw,
} from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Progress } from './ui/progress'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible'
import { Badge } from './ui/badge'
import { useImaging } from '../hooks'
import { useTelescopeStore, useImagingStore, PlateSolveResult } from '../stores'
import { useUIStore } from '../stores/uiStore'

interface PlateSolveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSolved?: (result: PlateSolveResult) => void
  onSyncMount?: (ra: number, dec: number) => void
}

export function PlateSolveDialog({
  open,
  onOpenChange,
  onSolved,
  onSyncMount,
}: PlateSolveDialogProps) {
  const { currentTelescopeId, telescopes, getCurrentStatus, addActivity } = useTelescopeStore()
  const { plateSolveResult, isPlateSolving } = useImagingStore()
  const { plateSolveApiKey } = useUIStore()
  const { plateSolve } = useImaging()

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [scaleLower, setScaleLower] = useState<number | undefined>(undefined)
  const [scaleUpper, setScaleUpper] = useState<number | undefined>(undefined)
  const [radius, setRadius] = useState<number | undefined>(10)
  const [timeout, setTimeoutValue] = useState(60)
  const [progress, setProgress] = useState(0)

  const currentTelescope = telescopes.find(t => t.id === currentTelescopeId)
  const isConnected = currentTelescope?.status === 'connected'
  const currentStatus = getCurrentStatus()

  // Simulate progress during solving
  useEffect(() => {
    if (!isPlateSolving) {
      setProgress(0)
      return
    }

    // Start progress animation
    setProgress(5)
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev
        return prev + Math.random() * 10
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPlateSolving])

  // Set progress to 100 when complete
  useEffect(() => {
    if (plateSolveResult?.status === 'success') {
      setProgress(100)
    } else if (plateSolveResult?.status === 'failed' || plateSolveResult?.status === 'timeout') {
      setProgress(0)
    }
  }, [plateSolveResult?.status])

  const handleSolve = useCallback(async () => {
    if (!currentTelescopeId) return

    addActivity(currentTelescopeId, 'info', 'Starting plate solve...')

    try {
      const result = await plateSolve(undefined, undefined, {
        apiKey: plateSolveApiKey || undefined,
        scaleLower,
        scaleUpper,
        centerRa: currentStatus?.ra,
        centerDec: currentStatus?.dec,
        radius,
        timeout,
      })

      if (result.status === 'success') {
        addActivity(currentTelescopeId, 'success',
          `Plate solve successful: RA ${result.ra?.toFixed(4)}°, Dec ${result.dec?.toFixed(4)}°`)
        onSolved?.(result)
      } else if (result.status === 'failed') {
        addActivity(currentTelescopeId, 'error', `Plate solve failed: ${result.error || 'Unknown error'}`)
      } else if (result.status === 'timeout') {
        addActivity(currentTelescopeId, 'warning', 'Plate solve timed out')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Plate solve failed'
      addActivity(currentTelescopeId, 'error', message)
    }
  }, [currentTelescopeId, plateSolveApiKey, scaleLower, scaleUpper, currentStatus, radius, timeout, plateSolve, addActivity, onSolved])

  const handleSyncMount = useCallback(() => {
    if (plateSolveResult?.ra !== undefined && plateSolveResult?.dec !== undefined) {
      onSyncMount?.(plateSolveResult.ra, plateSolveResult.dec)
      addActivity(currentTelescopeId || 'system', 'success',
        `Mount synced to RA ${plateSolveResult.ra.toFixed(4)}°, Dec ${plateSolveResult.dec.toFixed(4)}°`)
    }
  }, [plateSolveResult, currentTelescopeId, addActivity, onSyncMount])

  const formatCoordinate = (value: number | undefined, type: 'ra' | 'dec'): string => {
    if (value === undefined) return '---'

    if (type === 'ra') {
      const hours = value / 15
      const h = Math.floor(hours)
      const m = Math.floor((hours - h) * 60)
      const s = ((hours - h) * 60 - m) * 60
      return `${h}h ${m}m ${s.toFixed(2)}s`
    } else {
      const sign = value >= 0 ? '+' : '-'
      const absVal = Math.abs(value)
      const d = Math.floor(absVal)
      const m = Math.floor((absVal - d) * 60)
      const s = ((absVal - d) * 60 - m) * 60
      return `${sign}${d}° ${m}' ${s.toFixed(1)}"`
    }
  }

  const getStatusIcon = () => {
    switch (plateSolveResult?.status) {
      case 'success':
        return <Check className="h-5 w-5 text-green-500" />
      case 'failed':
        return <X className="h-5 w-5 text-destructive" />
      case 'timeout':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'processing':
      case 'pending':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />
      default:
        return <Compass className="h-5 w-5" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            Plate Solve
          </DialogTitle>
          <DialogDescription>
            Identify the exact sky position from the current image
          </DialogDescription>
        </DialogHeader>

        {!isConnected ? (
          <div className="py-8 text-center text-muted-foreground">
            <Compass className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Connect to a telescope to plate solve</p>
          </div>
        ) : !plateSolveApiKey ? (
          <div className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-yellow-500" />
            <p className="font-medium">API Key Required</p>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your Astrometry.net API key in Settings
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Status Display */}
            {plateSolveResult && plateSolveResult.status !== 'pending' && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="font-medium">
                    {plateSolveResult.status === 'success' ? 'Solved!' :
                     plateSolveResult.status === 'failed' ? 'Failed' :
                     plateSolveResult.status === 'timeout' ? 'Timeout' :
                     'Processing...'}
                  </span>
                  {plateSolveResult.jobId && (
                    <Badge variant="outline" className="ml-auto">
                      Job: {plateSolveResult.jobId}
                    </Badge>
                  )}
                </div>

                {plateSolveResult.status === 'success' && (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Right Ascension</p>
                        <p className="font-mono">{formatCoordinate(plateSolveResult.ra, 'ra')}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Declination</p>
                        <p className="font-mono">{formatCoordinate(plateSolveResult.dec, 'dec')}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {plateSolveResult.orientation !== undefined && (
                        <div>
                          <p className="text-muted-foreground">Orientation</p>
                          <p className="font-mono">{plateSolveResult.orientation.toFixed(1)}°</p>
                        </div>
                      )}
                      {plateSolveResult.pixscale !== undefined && (
                        <div>
                          <p className="text-muted-foreground">Pixel Scale</p>
                          <p className="font-mono">{plateSolveResult.pixscale.toFixed(2)}"/px</p>
                        </div>
                      )}
                      {plateSolveResult.radius !== undefined && (
                        <div>
                          <p className="text-muted-foreground">Field Radius</p>
                          <p className="font-mono">{plateSolveResult.radius.toFixed(2)}°</p>
                        </div>
                      )}
                    </div>

                    {plateSolveResult.objectsInField && plateSolveResult.objectsInField.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Objects in Field</p>
                        <div className="flex flex-wrap gap-1">
                          {plateSolveResult.objectsInField.slice(0, 10).map((obj, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {obj}
                            </Badge>
                          ))}
                          {plateSolveResult.objectsInField.length > 10 && (
                            <Badge variant="outline" className="text-xs">
                              +{plateSolveResult.objectsInField.length - 10} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {plateSolveResult.error && (
                  <p className="text-sm text-destructive">{plateSolveResult.error}</p>
                )}
              </div>
            )}

            {/* Progress Bar */}
            {isPlateSolving && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Processing...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Current Position Hint */}
            {currentStatus?.ra !== undefined && currentStatus?.dec !== undefined && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Target className="h-3 w-3" />
                <span>
                  Current position: RA {formatCoordinate(currentStatus.ra, 'ra')}, Dec {formatCoordinate(currentStatus.dec, 'dec')}
                </span>
              </div>
            )}

            {/* Advanced Options */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Advanced Options
                  <RotateCw className={`h-4 w-4 ml-auto transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Scale Lower (arcsec/px)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={scaleLower || ''}
                      onChange={(e) => setScaleLower(e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="Auto"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Scale Upper (arcsec/px)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={scaleUpper || ''}
                      onChange={(e) => setScaleUpper(e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="Auto"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Search Radius (degrees)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      max="180"
                      value={radius || ''}
                      onChange={(e) => setRadius(e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Timeout (seconds)</Label>
                    <Input
                      type="number"
                      step="10"
                      min="30"
                      max="300"
                      value={timeout}
                      onChange={(e) => setTimeoutValue(parseInt(e.target.value) || 60)}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          {plateSolveResult?.status === 'success' && onSyncMount && (
            <Button variant="secondary" onClick={handleSyncMount}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Mount
            </Button>
          )}

          <Button
            onClick={handleSolve}
            disabled={isPlateSolving || !isConnected || !plateSolveApiKey}
          >
            {isPlateSolving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Solving...
              </>
            ) : (
              <>
                <Compass className="h-4 w-4 mr-2" />
                {plateSolveResult ? 'Solve Again' : 'Solve'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
