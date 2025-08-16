"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, CheckCircle, AlertCircle, Server, Database, Search, Telescope, Wifi } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface InitializationStep {
  stage: string
  message: string
  progress: number
  timestamp: number
  completed: boolean
  icon?: React.ReactNode
}

interface ServerInitMessage {
  type: "server_init"
  payload: {
    stage: string
    message: string
    progress: number | null
    timestamp: number
  }
}

const stageIcons: Record<string, React.ReactNode> = {
  websocket: <Wifi className="w-5 h-5" />,
  startup: <Server className="w-5 h-5" />,
  memory: <Database className="w-5 h-5" />,
  database: <Database className="w-5 h-5" />,
  discovery: <Search className="w-5 h-5" />,
  telescope_connection: <Telescope className="w-5 h-5" />,
  complete: <CheckCircle className="w-5 h-5 text-green-500" />,
}

export function ServerInitStatus() {
  const [isVisible, setIsVisible] = useState(false)
  const [currentProgress, setCurrentProgress] = useState(0)
  const [currentStage, setCurrentStage] = useState("")
  const [currentMessage, setCurrentMessage] = useState("")
  const [steps, setSteps] = useState<InitializationStep[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasConnected, setHasConnected] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isServerStarting, setIsServerStarting] = useState(false)

  useEffect(() => {
    // Only attempt connection in specific scenarios
    const shouldConnect = 
      // Server restart detected (could be enhanced with actual detection)
      window.location.search.includes('server_restart') ||
      // Manual trigger via console
      (window as any).__forceServerInit ||
      // Development mode with explicit flag
      (process.env.NODE_ENV === 'development' && window.location.search.includes('show_init'))
    
    if (!shouldConnect) {
      return // Don't attempt connection unless explicitly needed
    }
    
    // Use the backend server directly for WebSocket connections
    // In production, this should be configured via environment variable
    const backendHost = process.env.NEXT_PUBLIC_BACKEND_HOST || 'localhost:8000'
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${backendHost}/api/ws`
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let hideTimeout: NodeJS.Timeout | null = null
    let maxRetries = 3 // Limit reconnection attempts

    const connect = () => {
      // Don't connect if we've already successfully connected and completed
      if (currentStage === "complete" && hasConnected) {
        return
      }
      
      // Don't spam connection attempts
      if (retryCount >= maxRetries && !isServerStarting) {
        return
      }
      try {
        ws = new WebSocket(wsUrl)
        
        ws.onopen = () => {
          console.log("Connected to server WebSocket for initialization updates")
          setIsConnecting(false)
          setError(null)
          setIsVisible(true)
          setHasConnected(true)
          setRetryCount(0)
          setIsServerStarting(true)
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            
            // Handle server initialization messages
            if (data.type === "server_init") {
              const message = data as ServerInitMessage
              const { stage, message: msg, progress, timestamp } = message.payload
              
              setCurrentStage(stage)
              setCurrentMessage(msg)
              
              if (progress !== null) {
                setCurrentProgress(progress)
              }
              
              // Add or update step
              setSteps(prev => {
                const existingIndex = prev.findIndex(s => s.stage === stage)
                const newStep: InitializationStep = {
                  stage,
                  message: msg,
                  progress: progress || 0,
                  timestamp,
                  completed: stage === "complete" || progress === 100,
                  icon: stageIcons[stage] || <Loader2 className="w-5 h-5 animate-spin" />
                }
                
                if (existingIndex >= 0) {
                  const updated = [...prev]
                  updated[existingIndex] = newStep
                  return updated
                } else {
                  return [...prev, newStep]
                }
              })
              
              // Hide the status window after completion
              if (stage === "complete") {
                hideTimeout = setTimeout(() => {
                  setIsVisible(false)
                }, 3000)
              }
            }
          } catch (err) {
            console.error("Failed to parse WebSocket message:", err)
          }
        }

        ws.onerror = (event) => {
          // Only log error if we were previously connected or actively trying
          if (hasConnected || isConnecting) {
            console.debug("WebSocket connection error - server may not be running")
          }
          setError(null) // Don't show error for normal "server not running" state
          setIsConnecting(false)
        }

        ws.onclose = () => {
          if (hasConnected) {
            console.debug("WebSocket connection closed")
          }
          setIsConnecting(false)
          
          // Only attempt reconnect if we were previously connected and haven't completed
          if (hasConnected && currentStage !== "complete" && retryCount < maxRetries) {
            setRetryCount(prev => prev + 1)
            reconnectTimeout = setTimeout(() => {
              console.debug("Attempting to reconnect...")
              setIsConnecting(true)
              connect()
            }, 2000 * (retryCount + 1)) // Exponential backoff
          }
        }
      } catch (err) {
        // Silently fail - server likely not running
        setError(null)
        setIsConnecting(false)
      }
    }

    // Only connect if explicitly triggered
    let initialTimeout: NodeJS.Timeout | undefined
    
    if (shouldConnect) {
      initialTimeout = setTimeout(() => {
        setIsConnecting(true)
        connect()
      }, 100)
    }
    
    // Also listen for manual trigger (e.g., from a "Connect" button)
    const handleManualConnect = () => {
      setRetryCount(0)
      setIsConnecting(true)
      connect()
    }
    
    // Store function for potential manual trigger
    (window as any).__connectServerStatus = handleManualConnect

    // Cleanup
    return () => {
      if (initialTimeout) clearTimeout(initialTimeout)
      if (hideTimeout) clearTimeout(hideTimeout)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
      delete (window as any).__connectServerStatus
    }
  }, [currentStage, hasConnected, retryCount, isServerStarting])

  // Only show if we have a reason to (connected, connecting, or have steps to show)
  if (!isVisible && !isConnecting && steps.length === 0) {
    return null
  }

  return (
    <AnimatePresence>
      {(isVisible || isConnecting) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="fixed top-4 right-4 z-50 w-96"
        >
          <Card className="shadow-xl border-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5" />
                  Server Initialization
                </CardTitle>
                {currentStage === "complete" ? (
                  <Badge variant="default" className="bg-green-500">
                    Ready
                  </Badge>
                ) : isConnecting ? (
                  <Badge variant="secondary">
                    Connecting...
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    Initializing
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <Progress value={currentProgress} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {currentMessage || (isConnecting ? "Connecting to server..." : "Waiting for updates...")}
                </p>
              </div>

              {/* Steps list */}
              {steps.length > 0 && (
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <motion.div
                      key={step.stage}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-3 text-sm"
                    >
                      <div className="flex-shrink-0">
                        {step.completed ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : step.stage === currentStage ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-muted" />
                        )}
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        {step.icon}
                        <span className={step.completed ? "text-muted-foreground" : ""}>
                          {step.message}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}