"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Activity, 
  Bug, 
  Play, 
  Square, 
  Trash2, 
  Settings, 
  Wifi, 
  WifiOff,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare
} from 'lucide-react'

import { featureFlags, useFeatureFlags, FeatureFlagDebug, type FeatureFlags } from '../../utils/feature-flags'
import { WebSocketService, ConnectionState, CommandAction, MessageType } from '../../services/websocket-service'

interface LogEntry {
  id: string
  timestamp: Date
  type: 'info' | 'error' | 'warning' | 'message'
  message: string
  data?: any
}

export function WebSocketDebugPanel() {
  const flags = useFeatureFlags()
  const [wsService] = useState(() => new WebSocketService({
    reconnectAttempts: 3,
    reconnectDelayMs: 1000,
    commandTimeoutMs: 5000
  }))
  
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [telescopeId, setTelescopeId] = useState('')
  const [commandAction, setCommandAction] = useState<CommandAction>(CommandAction.MOVE)
  const [commandParams, setCommandParams] = useState('{"direction": "up", "duration": 1000}')
  const [customMessage, setCustomMessage] = useState('')

  // Add log entry
  const addLog = (type: LogEntry['type'], message: string, data?: any) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type,
      message,
      data
    }
    setLogs(prev => [entry, ...prev].slice(0, 100)) // Keep last 100 entries
  }

  // Setup WebSocket event listeners
  useEffect(() => {
    const handleConnectionStateChange = (state: ConnectionState) => {
      setConnectionState(state)
      addLog('info', `Connection state changed to: ${state}`)
    }

    const handleMessage = (message: any) => {
      addLog('message', `Received ${message.type} message`, message)
    }

    const handleReconnected = () => {
      addLog('info', 'WebSocket reconnected successfully')
    }

    const handleReconnectFailed = () => {
      addLog('error', 'WebSocket reconnection failed')
    }

    wsService.on('connectionStateChanged', handleConnectionStateChange)
    wsService.on('message', handleMessage)
    wsService.on('reconnected', handleReconnected)
    wsService.on('reconnectFailed', handleReconnectFailed)

    return () => {
      wsService.off('connectionStateChanged', handleConnectionStateChange)
      wsService.off('message', handleMessage)
      wsService.off('reconnected', handleReconnected)
      wsService.off('reconnectFailed', handleReconnectFailed)
    }
  }, [wsService])

  // Connect to WebSocket
  const handleConnect = async () => {
    try {
      addLog('info', `Connecting to WebSocket${telescopeId ? ` for telescope: ${telescopeId}` : ''}...`)
      await wsService.connect(telescopeId || undefined)
      addLog('info', 'Connected successfully')
    } catch (error) {
      addLog('error', `Connection failed: ${error}`)
    }
  }

  // Disconnect from WebSocket
  const handleDisconnect = () => {
    wsService.disconnect()
    addLog('info', 'Disconnected from WebSocket')
  }

  // Send command
  const handleSendCommand = async () => {
    try {
      let params = {}
      if (commandParams.trim()) {
        params = JSON.parse(commandParams)
      }
      
      addLog('info', `Sending command: ${commandAction}`, params)
      const result = await wsService.sendCommand(commandAction, params, telescopeId || undefined)
      addLog('info', 'Command response received', result)
    } catch (error) {
      addLog('error', `Command failed: ${error}`)
    }
  }

  // Send custom message
  const handleSendCustomMessage = async () => {
    try {
      const message = JSON.parse(customMessage)
      await (wsService as any).sendMessage(message)
      addLog('info', 'Custom message sent', message)
    } catch (error) {
      addLog('error', `Failed to send custom message: ${error}`)
    }
  }

  // Clear logs
  const clearLogs = () => {
    setLogs([])
  }

  // Get connection status color
  const getStatusColor = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return 'bg-green-500'
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return 'bg-yellow-500'
      case ConnectionState.ERROR:
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  // Get status icon
  const getStatusIcon = () => {
    switch (connectionState) {
      case ConnectionState.CONNECTED:
        return <CheckCircle className="w-4 h-4" />
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return <Clock className="w-4 h-4" />
      case ConnectionState.ERROR:
        return <AlertCircle className="w-4 h-4" />
      default:
        return <WifiOff className="w-4 h-4" />
    }
  }

  // Update feature flag
  const updateFeatureFlag = (flag: keyof FeatureFlags, enabled: boolean) => {
    featureFlags.updateFlag(flag, enabled)
    addLog('info', `Feature flag ${flag}: ${enabled ? 'enabled' : 'disabled'}`)
  }

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5" />
            WebSocket Debug Panel
            <Badge variant="outline" className="ml-auto">
              Development Only
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="connection" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="connection">Connection</TabsTrigger>
              <TabsTrigger value="commands">Commands</TabsTrigger>
              <TabsTrigger value="flags">Feature Flags</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            {/* Connection Tab */}
            <TabsContent value="connection" className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
                  {getStatusIcon()}
                  <span className="font-medium capitalize">{connectionState}</span>
                </div>
                
                {connectionState === ConnectionState.CONNECTED ? (
                  <Button onClick={handleDisconnect} variant="destructive" size="sm">
                    <WifiOff className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>
                ) : (
                  <Button onClick={handleConnect} size="sm">
                    <Wifi className="w-4 h-4 mr-2" />
                    Connect
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="telescope-id">Telescope ID (optional)</Label>
                <Input
                  id="telescope-id"
                  value={telescopeId}
                  onChange={(e) => setTelescopeId(e.target.value)}
                  placeholder="Enter telescope ID or leave empty for general connection"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>WebSocket URL:</strong><br />
                  <code className="text-xs break-all">
                    ws://localhost:3000/api/ws{telescopeId ? `/${telescopeId}` : ''}
                  </code>
                </div>
                <div>
                  <strong>Connection Options:</strong><br />
                  <span className="text-xs">
                    Auto-reconnect: {flags.enableWebSocketReconnection ? '✅' : '❌'}<br />
                    Debug logs: {flags.enableWebSocketDebugLogs ? '✅' : '❌'}
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* Commands Tab */}
            <TabsContent value="commands" className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="command-action">Command Action</Label>
                    <select
                      id="command-action"
                      value={commandAction}
                      onChange={(e) => setCommandAction(e.target.value as CommandAction)}
                      className="w-full p-2 border rounded"
                    >
                      {Object.values(CommandAction).map(action => (
                        <option key={action} value={action}>{action}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="command-params">Parameters (JSON)</Label>
                    <Input
                      id="command-params"
                      value={commandParams}
                      onChange={(e) => setCommandParams(e.target.value)}
                      placeholder="{}"
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleSendCommand}
                  disabled={connectionState !== ConnectionState.CONNECTED}
                  className="w-full"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Send Command
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="custom-message">Custom Message (JSON)</Label>
                  <Textarea
                    id="custom-message"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder={JSON.stringify({
                      type: "heartbeat",
                      payload: {}
                    }, null, 2)}
                    rows={6}
                  />
                  <Button 
                    onClick={handleSendCustomMessage}
                    disabled={connectionState !== ConnectionState.CONNECTED}
                    variant="outline"
                    size="sm"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Send Custom Message
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Feature Flags Tab */}
            <TabsContent value="flags" className="space-y-4">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button 
                    onClick={() => FeatureFlagDebug.enableWebSocketFeatures()}
                    size="sm"
                    variant="outline"
                  >
                    Enable WebSocket Features
                  </Button>
                  <Button 
                    onClick={() => FeatureFlagDebug.disableWebSocketFeatures()}
                    size="sm"
                    variant="outline"
                  >
                    Disable WebSocket Features
                  </Button>
                  <Button 
                    onClick={() => featureFlags.resetToDefaults()}
                    size="sm"
                    variant="destructive"
                  >
                    Reset to Defaults
                  </Button>
                </div>

                <div className="space-y-3">
                  {Object.entries(flags).map(([flag, enabled]) => (
                    <div key={flag} className="flex items-center justify-between">
                      <Label htmlFor={flag} className="text-sm font-mono">
                        {flag}
                      </Label>
                      <Switch
                        id={flag}
                        checked={enabled}
                        onCheckedChange={(checked) => updateFeatureFlag(flag as keyof FeatureFlags, checked)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs" className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  {logs.length} log entries
                </span>
                <Button onClick={clearLogs} variant="outline" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Logs
                </Button>
              </div>

              <ScrollArea className="h-96 border rounded p-2">
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="text-xs border-b pb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant={log.type === 'error' ? 'destructive' : 
                                  log.type === 'warning' ? 'secondary' : 'default'}
                          className="text-xs"
                        >
                          {log.type}
                        </Badge>
                        <span className="text-gray-500">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="font-mono">{log.message}</div>
                      {log.data && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-gray-600">
                            Show data
                          </summary>
                          <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

export default WebSocketDebugPanel