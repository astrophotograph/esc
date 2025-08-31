import React, { useEffect, useState } from 'react'
import { AlertCircle, Loader2, CheckCircle, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getWebSocketService, ConnectionState } from '@/services/websocket-service'

export function WebSocketStatusNotification() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED)
  const [showNotification, setShowNotification] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [timeDisconnected, setTimeDisconnected] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    const wsService = getWebSocketService()
    let disconnectTimer: NodeJS.Timeout | null = null
    let elapsedTimer: NodeJS.Timeout | null = null
    let attemptCounter = 0

    const handleConnectionStateChange = (newState: ConnectionState, previousState: ConnectionState) => {
      setConnectionState(newState)

      // Show notification after 3 seconds of disconnection/reconnecting
      if (newState === ConnectionState.DISCONNECTED || newState === ConnectionState.RECONNECTING) {
        if (!disconnectTimer) {
          disconnectTimer = setTimeout(() => {
            setShowNotification(true)
            setTimeDisconnected(Date.now())
            // Start elapsed time counter
            elapsedTimer = setInterval(() => {
              setElapsedTime(Math.floor((Date.now() - (timeDisconnected || Date.now())) / 1000))
            }, 1000)
          }, 3000)
        }
        
        if (newState === ConnectionState.RECONNECTING) {
          attemptCounter++
          setReconnectAttempts(attemptCounter)
        }
      } else if (newState === ConnectionState.CONNECTED) {
        // Clear timers
        if (disconnectTimer) {
          clearTimeout(disconnectTimer)
          disconnectTimer = null
        }
        if (elapsedTimer) {
          clearInterval(elapsedTimer)
          elapsedTimer = null
        }
        
        // If we were showing the notification, keep it visible briefly to show success
        if (showNotification) {
          setTimeout(() => {
            setShowNotification(false)
            setTimeDisconnected(null)
            setElapsedTime(0)
            attemptCounter = 0
            setReconnectAttempts(0)
          }, 2000)
        }
      }
    }

    // Get initial state
    const initialState = wsService.getConnectionState()
    setConnectionState(initialState)
    
    // Listen for connection state changes
    wsService.on('connectionStateChanged', handleConnectionStateChange)

    return () => {
      wsService.off('connectionStateChanged', handleConnectionStateChange)
      if (disconnectTimer) clearTimeout(disconnectTimer)
      if (elapsedTimer) clearInterval(elapsedTimer)
    }
  }, [showNotification, timeDisconnected])

  if (!showNotification) return null

  const formatElapsedTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50",
      "bg-background border rounded-lg shadow-lg p-4",
      "min-w-[320px] max-w-[400px]",
      "transition-all duration-300 ease-in-out",
      showNotification ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {connectionState === ConnectionState.CONNECTED ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : connectionState === ConnectionState.RECONNECTING ? (
            <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />
          ) : connectionState === ConnectionState.ERROR ? (
            <AlertCircle className="h-5 w-5 text-red-500" />
          ) : (
            <WifiOff className="h-5 w-5 text-orange-500" />
          )}
        </div>
        
        <div className="flex-1 space-y-1">
          <div className="font-medium text-sm">
            {connectionState === ConnectionState.CONNECTED && (
              <span className="text-green-600">Connection Restored</span>
            )}
            {connectionState === ConnectionState.CONNECTING && (
              <span className="text-blue-600">Connecting to Server</span>
            )}
            {connectionState === ConnectionState.RECONNECTING && (
              <span className="text-yellow-600">Reconnecting to Server</span>
            )}
            {connectionState === ConnectionState.DISCONNECTED && (
              <span className="text-orange-600">Connection Lost</span>
            )}
            {connectionState === ConnectionState.ERROR && (
              <span className="text-red-600">Connection Error</span>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground space-y-1">
            {connectionState === ConnectionState.CONNECTED ? (
              <p>Successfully reconnected to the server</p>
            ) : connectionState === ConnectionState.ERROR ? (
              <p>Failed to connect to the server. Please check your connection.</p>
            ) : (
              <>
                <p>
                  {connectionState === ConnectionState.RECONNECTING 
                    ? `Attempting to reconnect... (Attempt ${reconnectAttempts})`
                    : 'The WebSocket connection to the server was interrupted'
                  }
                </p>
                {elapsedTime > 0 && (
                  <p>Disconnected for {formatElapsedTime(elapsedTime)}</p>
                )}
              </>
            )}
          </div>
          
          {connectionState !== ConnectionState.CONNECTED && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-full h-1 overflow-hidden">
                  <div className="h-full bg-primary animate-pulse" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}