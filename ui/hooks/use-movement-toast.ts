import { useRef, useCallback } from "react"
import { toast } from "sonner"

export interface MovementToastOptions {
  fadeOutDelay?: number
  updateDebounce?: number
}

export function useMovementToast(options: MovementToastOptions = {}) {
  const { fadeOutDelay = 1500, updateDebounce = 100 } = options
  
  const toastIdRef = useRef<string | number | null>(null)
  const fadeOutTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const isMovingRef = useRef<boolean>(false)
  
  const clearFadeOutTimer = useCallback(() => {
    if (fadeOutTimerRef.current) {
      clearTimeout(fadeOutTimerRef.current)
      fadeOutTimerRef.current = null
    }
  }, [])
  
  const showMovementToast = useCallback((direction: string) => {
    const now = Date.now()
    
    // Debounce updates
    if (now - lastUpdateRef.current < updateDebounce && toastIdRef.current) {
      return
    }
    
    lastUpdateRef.current = now
    isMovingRef.current = true
    clearFadeOutTimer()
    
    const message = direction === "stop" 
      ? "Telescope movement stopped" 
      : `Moving telescope ${direction}`
    
    if (toastIdRef.current) {
      // Update existing toast
      toast.info("Telescope Movement", {
        id: toastIdRef.current,
        description: message,
        duration: Infinity, // Keep it open while moving
      })
    } else {
      // Create new toast
      toastIdRef.current = toast.info("Telescope Movement", {
        description: message,
        duration: Infinity, // Keep it open while moving
      })
    }
    
    // If it's a stop command, set up fade out
    if (direction === "stop") {
      isMovingRef.current = false
      fadeOutTimerRef.current = setTimeout(() => {
        if (toastIdRef.current && !isMovingRef.current) {
          toast.dismiss(toastIdRef.current)
          toastIdRef.current = null
        }
      }, fadeOutDelay)
    }
  }, [updateDebounce, fadeOutDelay, clearFadeOutTimer])
  
  const dismissMovementToast = useCallback(() => {
    clearFadeOutTimer()
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
    }
    isMovingRef.current = false
  }, [clearFadeOutTimer])
  
  return {
    showMovementToast,
    dismissMovementToast,
  }
}