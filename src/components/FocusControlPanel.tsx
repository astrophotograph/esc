import { useState, useEffect, useCallback } from 'react'
import { Focus, ChevronUp, ChevronDown, Crosshair, Minus, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { useTelescope } from '../hooks'
import { useTelescopeStore } from '../stores'

interface FocusControlPanelProps {
  compact?: boolean
}

const STEP_SIZES = [1, 5, 10, 25, 50, 100]

export function FocusControlPanel({ compact = false }: FocusControlPanelProps) {
  const { currentTelescopeId, telescopes, getCurrentStatus, addActivity } = useTelescopeStore()
  const { focusIncrement, autoFocus, getFocuserPosition } = useTelescope()

  const [focuserPosition, setFocuserPosition] = useState<number | null>(null)
  const [stepSize, setStepSize] = useState(10)
  const [isMoving, setIsMoving] = useState(false)
  const [isAutoFocusing, setIsAutoFocusing] = useState(false)

  const currentTelescope = telescopes.find(t => t.id === currentTelescopeId)
  const isConnected = currentTelescope?.status === 'connected'
  const currentStatus = getCurrentStatus()

  // Get initial focuser position
  useEffect(() => {
    if (isConnected && currentTelescopeId) {
      getFocuserPosition(currentTelescopeId)
        .then(pos => setFocuserPosition(pos))
        .catch(() => {}) // Silently fail - not all scopes report position
    }
  }, [isConnected, currentTelescopeId, getFocuserPosition])

  // Update from status
  useEffect(() => {
    if (currentStatus?.focuserPosition !== undefined) {
      setFocuserPosition(currentStatus.focuserPosition)
    }
  }, [currentStatus?.focuserPosition])

  const handleFocusIn = useCallback(async () => {
    if (!currentTelescopeId) return

    setIsMoving(true)
    try {
      await focusIncrement(currentTelescopeId, -stepSize)
      // Update local position estimate
      setFocuserPosition(prev => prev !== null ? prev - stepSize : null)
    } catch (error) {
      // Error is handled in hook
    } finally {
      setIsMoving(false)
    }
  }, [currentTelescopeId, stepSize, focusIncrement])

  const handleFocusOut = useCallback(async () => {
    if (!currentTelescopeId) return

    setIsMoving(true)
    try {
      await focusIncrement(currentTelescopeId, stepSize)
      // Update local position estimate
      setFocuserPosition(prev => prev !== null ? prev + stepSize : null)
    } catch (error) {
      // Error is handled in hook
    } finally {
      setIsMoving(false)
    }
  }, [currentTelescopeId, stepSize, focusIncrement])

  const handleAutoFocus = useCallback(async () => {
    if (!currentTelescopeId) return

    setIsAutoFocusing(true)
    addActivity(currentTelescopeId, 'info', 'Starting auto-focus...')

    try {
      await autoFocus(currentTelescopeId)
      // Refresh position after auto-focus completes
      const newPos = await getFocuserPosition(currentTelescopeId)
      setFocuserPosition(newPos)
    } catch (error) {
      // Error is handled in hook
    } finally {
      setIsAutoFocusing(false)
    }
  }, [currentTelescopeId, autoFocus, getFocuserPosition, addActivity])

  if (!isConnected) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Focus className="h-4 w-4" />
            Focus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect to a telescope to control focus
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
            <Focus className="h-4 w-4" />
            Focus
          </CardTitle>
          {focuserPosition !== null && (
            <Badge variant="outline">
              Position: {focuserPosition}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step Size Selection */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Step Size</label>
          <div className="flex flex-wrap gap-1">
            {STEP_SIZES.map(size => (
              <Button
                key={size}
                variant={stepSize === size ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStepSize(size)}
                className="min-w-[3rem]"
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        {/* Manual Focus Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={handleFocusIn}
            disabled={isMoving || isAutoFocusing}
            className="flex flex-col h-auto py-3 px-6"
          >
            <ChevronDown className="h-6 w-6" />
            <span className="text-xs mt-1">In (-)</span>
          </Button>

          <div className="flex flex-col items-center">
            <div className={cn(
              "w-12 h-12 rounded-full border-2 flex items-center justify-center",
              isMoving && "animate-pulse border-primary",
              isAutoFocusing && "animate-spin border-primary"
            )}>
              <Crosshair className="h-6 w-6" />
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {isMoving ? 'Moving...' : isAutoFocusing ? 'Auto...' : 'Ready'}
            </span>
          </div>

          <Button
            variant="outline"
            size="lg"
            onClick={handleFocusOut}
            disabled={isMoving || isAutoFocusing}
            className="flex flex-col h-auto py-3 px-6"
          >
            <ChevronUp className="h-6 w-6" />
            <span className="text-xs mt-1">Out (+)</span>
          </Button>
        </div>

        {/* Fine Adjustment Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">Fine Adjustment</label>
            <span className="text-xs text-muted-foreground">
              {stepSize > 0 ? `+${stepSize}` : stepSize}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Minus className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[stepSize]}
              min={1}
              max={100}
              step={1}
              onValueChange={([value]) => setStepSize(value)}
              className="flex-1"
            />
            <Plus className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Auto Focus Button */}
        <Button
          onClick={handleAutoFocus}
          disabled={isMoving || isAutoFocusing}
          variant="secondary"
          className="w-full"
        >
          <Crosshair className={cn("h-4 w-4 mr-2", isAutoFocusing && "animate-spin")} />
          {isAutoFocusing ? 'Auto-Focusing...' : 'Auto Focus'}
        </Button>

        {/* Tips */}
        <p className="text-xs text-muted-foreground text-center">
          Use smaller steps for fine adjustments, larger steps for coarse focus
        </p>
      </CardContent>
    </Card>
  )
}
