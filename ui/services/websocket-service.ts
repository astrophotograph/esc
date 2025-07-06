/**
 * WebSocket service for real-time telescope communication.
 * 
 * This service handles WebSocket connections to the backend,
 * manages reconnection logic, and provides a clean API for
 * sending commands and receiving status updates.
 */

import { EventEmitter } from 'events'

// WebSocket message types (matching backend protocol)
export enum MessageType {
  STATUS_UPDATE = 'status_update',
  TELESCOPE_DISCOVERED = 'telescope_discovered',
  TELESCOPE_LOST = 'telescope_lost',
  CONTROL_COMMAND = 'control_command',
  COMMAND_RESPONSE = 'command_response',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe'
}

export enum CommandAction {
  GOTO = 'goto',
  MOVE = 'move',
  PARK = 'park',
  FOCUS = 'focus',
  FOCUS_INCREMENT = 'focus_increment',
  START_IMAGING = 'start_imaging',
  STOP_IMAGING = 'stop_imaging',
  SET_GAIN = 'set_gain',
  SET_EXPOSURE = 'set_exposure'
}

export enum SubscriptionType {
  ALL = 'all',
  STATUS = 'status',
  IMAGING = 'imaging',
  POSITION = 'position',
  FOCUS = 'focus',
  SYSTEM = 'system'
}

export interface WebSocketMessage {
  id: string
  type: MessageType
  telescope_id?: string
  timestamp: number
  payload: Record<string, any>
}

export interface StatusUpdateMessage extends WebSocketMessage {
  type: MessageType.STATUS_UPDATE
  payload: {
    status: Record<string, any>
    changes: string[]
    full_update: boolean
  }
}

export interface ControlCommandMessage extends WebSocketMessage {
  type: MessageType.CONTROL_COMMAND
  payload: {
    action: CommandAction
    parameters: Record<string, any>
    response_expected: boolean
  }
}

export interface CommandResponseMessage extends WebSocketMessage {
  type: MessageType.COMMAND_RESPONSE
  payload: {
    command_id: string
    success: boolean
    result?: Record<string, any>
    error?: string
  }
}

export interface TelescopeDiscoveredMessage extends WebSocketMessage {
  type: MessageType.TELESCOPE_DISCOVERED
  payload: {
    telescope: Record<string, any>
  }
}

export interface TelescopeLostMessage extends WebSocketMessage {
  type: MessageType.TELESCOPE_LOST
  payload: {
    reason: string
  }
}

export interface ErrorMessage extends WebSocketMessage {
  type: MessageType.ERROR
  payload: {
    error_code: string
    message: string
  }
}

export type WebSocketMessageUnion = 
  | StatusUpdateMessage 
  | ControlCommandMessage 
  | CommandResponseMessage 
  | TelescopeDiscoveredMessage 
  | TelescopeLostMessage 
  | ErrorMessage

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export interface WebSocketServiceConfig {
  baseUrl?: string
  reconnectAttempts?: number
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
  heartbeatIntervalMs?: number
  commandTimeoutMs?: number
}

export interface PendingCommand {
  id: string
  resolve: (result: any) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

/**
 * WebSocket service for telescope communication
 */
export class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<WebSocketServiceConfig>
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED
  private reconnectAttempts = 0
  private reconnectTimeout: NodeJS.Timeout | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private messageQueue: WebSocketMessage[] = []
  private pendingCommands = new Map<string, PendingCommand>()
  private subscriptions = new Set<string>()
  
  // Connection details
  private telescopeId: string | null = null
  private clientId: string | null = null

  constructor(config: WebSocketServiceConfig = {}) {
    super()
    
    this.config = {
      baseUrl: config.baseUrl || (typeof window !== 'undefined' ? 
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}` : 
        'ws://localhost:8000'),
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelayMs: config.reconnectDelayMs || 1000,
      maxReconnectDelayMs: config.maxReconnectDelayMs || 30000,
      heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
      commandTimeoutMs: config.commandTimeoutMs || 10000
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect(telescopeId?: string, clientId?: string): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      return
    }

    this.telescopeId = telescopeId || null
    this.clientId = clientId || null
    
    this.setConnectionState(ConnectionState.CONNECTING)

    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL
        let wsUrl = `${this.config.baseUrl}/api/ws`
        
        if (telescopeId) {
          wsUrl = `${this.config.baseUrl}/api/ws/${encodeURIComponent(telescopeId)}`
        }
        
        const params = new URLSearchParams()
        if (clientId) {
          params.set('client_id', clientId)
        }
        if (params.toString()) {
          wsUrl += `?${params.toString()}`
        }

        console.log(`Connecting to WebSocket: ${wsUrl}`)
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.setConnectionState(ConnectionState.CONNECTED)
          this.reconnectAttempts = 0
          this.startHeartbeat()
          this.processMessageQueue()
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onclose = (event) => {
          console.log(`WebSocket closed: ${event.code} ${event.reason}`)
          this.cleanup()
          
          if (!event.wasClean && this.connectionState !== ConnectionState.DISCONNECTED) {
            this.handleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.setConnectionState(ConnectionState.ERROR)
          reject(new Error('Failed to connect to WebSocket'))
        }

      } catch (error) {
        this.setConnectionState(ConnectionState.ERROR)
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.setConnectionState(ConnectionState.DISCONNECTED)
    this.cleanup()
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  /**
   * Send a control command to the telescope
   */
  async sendCommand(
    action: CommandAction,
    parameters: Record<string, any> = {},
    telescopeId?: string
  ): Promise<any> {
    const message: ControlCommandMessage = {
      id: this.generateMessageId(),
      type: MessageType.CONTROL_COMMAND,
      telescope_id: telescopeId || this.telescopeId || undefined,
      timestamp: Date.now(),
      payload: {
        action,
        parameters,
        response_expected: true
      }
    }

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(message.id)
        reject(new Error(`Command timeout: ${action}`))
      }, this.config.commandTimeoutMs)

      // Store pending command
      this.pendingCommands.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeout
      })

      // Send message
      this.sendMessage(message).catch(reject)
    })
  }

  /**
   * Subscribe to telescope updates
   */
  async subscribe(
    subscriptionTypes: SubscriptionType[] = [SubscriptionType.ALL],
    telescopeId?: string
  ): Promise<void> {
    const message: WebSocketMessage = {
      id: this.generateMessageId(),
      type: MessageType.SUBSCRIBE,
      telescope_id: telescopeId || this.telescopeId || undefined,
      timestamp: Date.now(),
      payload: {
        subscription_types: subscriptionTypes,
        all_telescopes: !telescopeId && !this.telescopeId
      }
    }

    await this.sendMessage(message)
    
    // Track subscription for reconnection
    const subKey = `${telescopeId || 'all'}:${subscriptionTypes.join(',')}`
    this.subscriptions.add(subKey)
  }

  /**
   * Unsubscribe from telescope updates
   */
  async unsubscribe(
    subscriptionTypes: SubscriptionType[] = [SubscriptionType.ALL],
    telescopeId?: string
  ): Promise<void> {
    const message: WebSocketMessage = {
      id: this.generateMessageId(),
      type: MessageType.UNSUBSCRIBE,
      telescope_id: telescopeId || this.telescopeId || undefined,
      timestamp: Date.now(),
      payload: {
        subscription_types: subscriptionTypes,
        all_telescopes: !telescopeId && !this.telescopeId
      }
    }

    await this.sendMessage(message)
    
    // Remove from tracked subscriptions
    const subKey = `${telescopeId || 'all'}:${subscriptionTypes.join(',')}`
    this.subscriptions.delete(subKey)
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && 
           this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Send a WebSocket message
   */
  private async sendMessage(message: WebSocketMessage): Promise<void> {
    if (!this.isConnected()) {
      // Queue message for later if we're reconnecting
      if (this.connectionState === ConnectionState.RECONNECTING) {
        this.messageQueue.push(message)
        return
      }
      throw new Error('WebSocket not connected')
    }

    try {
      this.ws!.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
      throw error
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessageUnion = JSON.parse(data)
      
      // Handle command responses
      if (message.type === MessageType.COMMAND_RESPONSE) {
        this.handleCommandResponse(message as CommandResponseMessage)
        return
      }

      // Handle heartbeat
      if (message.type === MessageType.HEARTBEAT) {
        // Echo heartbeat back
        this.sendMessage({
          id: this.generateMessageId(),
          type: MessageType.HEARTBEAT,
          timestamp: Date.now(),
          payload: {}
        }).catch(console.error)
        return
      }

      // Emit message to listeners
      this.emit('message', message)
      this.emit(message.type, message)

      // Emit telescope-specific events
      if (message.telescope_id) {
        this.emit(`${message.type}:${message.telescope_id}`, message)
      }

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, data)
    }
  }

  /**
   * Handle command response message
   */
  private handleCommandResponse(message: CommandResponseMessage): void {
    const commandId = message.payload.command_id
    const pendingCommand = this.pendingCommands.get(commandId)
    
    if (!pendingCommand) {
      console.warn(`Received response for unknown command: ${commandId}`)
      return
    }

    // Clear timeout and remove from pending
    clearTimeout(pendingCommand.timeout)
    this.pendingCommands.delete(commandId)

    // Resolve or reject the promise
    if (message.payload.success) {
      pendingCommand.resolve(message.payload.result)
    } else {
      pendingCommand.reject(new Error(message.payload.error || 'Command failed'))
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.connectionState === ConnectionState.DISCONNECTED) {
      return // User requested disconnect
    }

    if (this.reconnectAttempts >= this.config.reconnectAttempts) {
      console.error('Max reconnect attempts reached')
      this.setConnectionState(ConnectionState.ERROR)
      this.emit('reconnectFailed')
      return
    }

    this.setConnectionState(ConnectionState.RECONNECTING)
    
    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelayMs
    )

    this.reconnectAttempts++
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.reconnectAttempts})`)

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect(this.telescopeId || undefined, this.clientId || undefined)
        
        // Restore subscriptions
        for (const subscription of this.subscriptions) {
          const [telescopeId, types] = subscription.split(':')
          const subscriptionTypes = types.split(',') as SubscriptionType[]
          await this.subscribe(subscriptionTypes, telescopeId === 'all' ? undefined : telescopeId)
        }
        
        this.emit('reconnected')
        
      } catch (error) {
        console.error('Reconnection failed:', error)
        this.handleReconnect() // Try again
      }
    }, delay)
  }

  /**
   * Set connection state and emit event
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const previousState = this.connectionState
      this.connectionState = state
      this.emit('connectionStateChanged', state, previousState)
    }
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendMessage({
          id: this.generateMessageId(),
          type: MessageType.HEARTBEAT,
          timestamp: Date.now(),
          payload: {}
        }).catch(console.error)
      }
    }, this.config.heartbeatIntervalMs)
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!
      this.sendMessage(message).catch(console.error)
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.stopHeartbeat()
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // Reject all pending commands
    for (const [id, command] of this.pendingCommands) {
      clearTimeout(command.timeout)
      command.reject(new Error('Connection closed'))
    }
    this.pendingCommands.clear()
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// Default export for convenience
export default WebSocketService