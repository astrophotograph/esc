import { useState, useEffect, useCallback } from 'react'
import { Navigation, X, Loader2, Target, MapPin } from 'lucide-react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { cn } from '../lib/utils'
import { useTelescope } from '../hooks'
import { useTelescopeStore } from '../stores'

interface GotoProgressOverlayProps {
  targetName?: string
  targetRa?: number
  targetDec?: number
  onComplete?: () => void
  onCancel?: () => void
}

export function GotoProgressOverlay({
  targetName,
  targetRa,
  targetDec,
  onComplete,
  onCancel,
}: GotoProgressOverlayProps) {
  const { currentTelescopeId, getCurrentStatus, addActivity } = useTelescopeStore()
  const { stopGoto } = useTelescope()

  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'slewing' | 'centering' | 'complete' | 'cancelled'>('slewing')
  const [startRa, setStartRa] = useState<number | null>(null)
  const [startDec, setStartDec] = useState<number | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const currentStatus = getCurrentStatus()
  const isSlewing = currentStatus?.slewing

  // Calculate progress based on distance remaining
  useEffect(() => {
    if (!isSlewing && status === 'slewing') {
      // Slewing has stopped
      setProgress(100)
      setStatus('complete')
      onComplete?.()
      return
    }

    if (!currentStatus?.ra || !currentStatus?.dec || !targetRa || !targetDec) {
      return
    }

    // Save starting position
    if (startRa === null || startDec === null) {
      setStartRa(currentStatus.ra)
      setStartDec(currentStatus.dec)
      return
    }

    // Calculate total distance from start to target
    const totalDistRa = Math.abs(targetRa - startRa)
    const totalDistDec = Math.abs(targetDec - startDec)
    const totalDistance = Math.sqrt(totalDistRa * totalDistRa + totalDistDec * totalDistDec)

    // Calculate remaining distance
    const remainingDistRa = Math.abs(targetRa - currentStatus.ra)
    const remainingDistDec = Math.abs(targetDec - currentStatus.dec)
    const remainingDistance = Math.sqrt(remainingDistRa * remainingDistRa + remainingDistDec * remainingDistDec)

    // Calculate progress (avoid division by zero)
    if (totalDistance > 0) {
      const progressPercent = Math.min(100, ((totalDistance - remainingDistance) / totalDistance) * 100)
      setProgress(Math.max(0, progressPercent))
    }
  }, [currentStatus?.ra, currentStatus?.dec, targetRa, targetDec, startRa, startDec, isSlewing, status, onComplete])

  // Auto-dismiss after completion
  useEffect(() => {
    if (status === 'complete') {
      const timer = setTimeout(() => {
        onComplete?.()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [status, onComplete])

  const handleCancel = useCallback(async () => {
    if (!currentTelescopeId) return

    setIsCancelling(true)
    try {
      await stopGoto(currentTelescopeId)
      setStatus('cancelled')
      addActivity(currentTelescopeId, 'warning', `GOTO to ${targetName || 'target'} cancelled`)
      onCancel?.()
    } catch (error) {
      // Error is handled in hook
    } finally {
      setIsCancelling(false)
    }
  }, [currentTelescopeId, stopGoto, targetName, addActivity, onCancel])

  const formatCoordinate = (value: number | undefined, type: 'ra' | 'dec'): string => {
    if (value === undefined) return '---'

    if (type === 'ra') {
      // Convert degrees to hours
      const hours = value / 15
      const h = Math.floor(hours)
      const m = Math.floor((hours - h) * 60)
      const s = ((hours - h) * 60 - m) * 60
      return `${h}h ${m}m ${s.toFixed(1)}s`
    } else {
      // Declination in degrees
      const sign = value >= 0 ? '+' : '-'
      const absVal = Math.abs(value)
      const d = Math.floor(absVal)
      const m = Math.floor((absVal - d) * 60)
      const s = ((absVal - d) * 60 - m) * 60
      return `${sign}${d}° ${m}' ${s.toFixed(0)}"`
    }
  }

  if (status === 'cancelled') {
    return null
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
      <div className="bg-card rounded-lg shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              status === 'complete' ? "bg-green-500/20" : "bg-primary/20"
            )}>
              {status === 'complete' ? (
                <Target className="h-5 w-5 text-green-500" />
              ) : (
                <Navigation className={cn("h-5 w-5 text-primary", isSlewing && "animate-pulse")} />
              )}
            </div>
            <div>
              <h3 className="font-semibold">
                {status === 'complete' ? 'GOTO Complete' : 'Slewing to Target'}
              </h3>
              {targetName && (
                <p className="text-sm text-muted-foreground">{targetName}</p>
              )}
            </div>
          </div>

          {status !== 'complete' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(progress)}%</span>
            <span>
              {status === 'complete' ? 'Target reached' :
               status === 'centering' ? 'Centering...' :
               'Slewing...'}
            </span>
          </div>
        </div>

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>Current</span>
            </div>
            <div className="font-mono text-xs">
              <div>RA: {formatCoordinate(currentStatus?.ra, 'ra')}</div>
              <div>Dec: {formatCoordinate(currentStatus?.dec, 'dec')}</div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>Target</span>
            </div>
            <div className="font-mono text-xs">
              <div>RA: {formatCoordinate(targetRa, 'ra')}</div>
              <div>Dec: {formatCoordinate(targetDec, 'dec')}</div>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        {status !== 'complete' && (
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isCancelling}
            className="w-full"
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <X className="h-4 w-4 mr-2" />
                Stop GOTO
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
