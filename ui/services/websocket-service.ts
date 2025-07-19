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
  ANNOTATION_EVENT = 'annotation_event',
  CONTROL_COMMAND = 'control_command',
  COMMAND_RESPONSE = 'command_response',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  ALERT = 'alert'
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
  SET_EXPOSURE = 'set_exposure',
  SCENERY = 'scenery',
  SET_IMAGE_ENHANCEMENT = 'set_image_enhancement',
  GET_IMAGE_ENHANCEMENT = 'get_image_enhancement'
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

export interface AlertMessage extends WebSocketMessage {
  type: MessageType.ALERT
  payload: {
    state: string
    error: string
    code?: string
  }
}

export type WebSocketMessageUnion =
  | StatusUpdateMessage
  | ControlCommandMessage
  | CommandResponseMessage
  | TelescopeDiscoveredMessage
  | TelescopeLostMessage
  | ErrorMessage
  | AlertMessage

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

// Static counter to track instances
let instanceCounter = 0;

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
  private healthCheckInterval: NodeJS.Timeout | null = null
  private messageQueue: WebSocketMessage[] = []
  private pendingCommands = new Map<string, PendingCommand>()
  private subscriptions = new Set<string>()

  // Connection details
  private telescopeId: string | null = null
  private clientId: string | null = null
  private instanceId: number

  // Health monitoring
  private lastMessageTime: number = 0
  private lastHeartbeatReceived: number = 0
  private healthCheckIntervalMs: number = 10000 // Check health every 10 seconds
  private messageTimeoutMs: number = 60000 // Force reconnect if no messages for 60 seconds

  constructor(config: WebSocketServiceConfig = {}) {
    super()

    this.instanceId = ++instanceCounter

    this.config = {
      baseUrl: config.baseUrl || (typeof window !== 'undefined' ?
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}` :
        'ws://localhost:3000'),
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

    if (this.connectionState === ConnectionState.CONNECTING) {
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

        console.log('Attempting WebSocket connection to:', wsUrl)
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          this.setConnectionState(ConnectionState.CONNECTED)
          this.reconnectAttempts = 0
          this.lastMessageTime = Date.now()
          this.lastHeartbeatReceived = Date.now()

          // Small delay to ensure the server-side connection is fully established
          setTimeout(() => {
            this.processMessageQueue()
            // Start heartbeat after connection is fully established
            setTimeout(() => {
              this.startHeartbeat()
              this.startHealthCheck()
            }, 1000)  // Wait 1 second before starting heartbeats and health checks
            resolve()
          }, 100)
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onclose = (event) => {
          this.cleanup()

          if (!event.wasClean && this.connectionState !== ConnectionState.DISCONNECTED) {
            this.handleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket connection error:', error, 'URL:', wsUrl)
          this.setConnectionState(ConnectionState.ERROR)
          reject(new Error(`Failed to connect to WebSocket at ${wsUrl}`))
          
          // Trigger reconnect logic on error as well
          if (this.connectionState !== ConnectionState.DISCONNECTED) {
            this.handleReconnect()
          }
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
   * Get health status information
   */
  getHealthStatus(): {
    isConnected: boolean
    lastMessageTime: number
    lastHeartbeatReceived: number
    timeSinceLastMessage: number
    timeSinceLastHeartbeat: number
    connectionState: ConnectionState
  } {
    const now = Date.now()
    return {
      isConnected: this.isConnected(),
      lastMessageTime: this.lastMessageTime,
      lastHeartbeatReceived: this.lastHeartbeatReceived,
      timeSinceLastMessage: now - this.lastMessageTime,
      timeSinceLastHeartbeat: now - this.lastHeartbeatReceived,
      connectionState: this.connectionState
    }
  }

  /**
   * Manually force reconnection
   */
  forceReconnectManual(reason: string = 'Manual reconnection requested'): void {
    console.log(`Manual WebSocket reconnection triggered: ${reason}`)
    this.forceReconnect(reason)
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

      // Update health monitoring
      this.lastMessageTime = Date.now()

      // Handle command responses
      if (message.type === MessageType.COMMAND_RESPONSE) {
        this.handleCommandResponse(message as CommandResponseMessage)
        return
      }

      // Handle heartbeat
      if (message.type === MessageType.HEARTBEAT) {
        this.lastHeartbeatReceived = Date.now()
        // Don't echo heartbeat back - this causes a ping-pong loop!
        // The client sends its own heartbeats on a timer
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
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    this.stopHealthCheck()

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, this.healthCheckIntervalMs)
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  /**
   * Perform health check and force reconnection if needed
   */
  private performHealthCheck(): void {
    if (this.connectionState !== ConnectionState.CONNECTED || !this.ws) {
      return
    }

    const now = Date.now()
    const timeSinceLastMessage = now - this.lastMessageTime
    const timeSinceLastHeartbeat = now - this.lastHeartbeatReceived

    // Check if we haven't received any messages in the timeout period
    if (timeSinceLastMessage > this.messageTimeoutMs) {
      console.warn(`WebSocket health check failed: No messages received for ${timeSinceLastMessage}ms (limit: ${this.messageTimeoutMs}ms)`)
      this.forceReconnect('No messages received within timeout period')
      return
    }

    // Check WebSocket readyState
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`WebSocket health check failed: Connection state is ${this.ws.readyState} (expected ${WebSocket.OPEN})`)
      this.forceReconnect('WebSocket connection is not in OPEN state')
      return
    }

    // Log health status periodically
    if (this.healthCheckIntervalMs >= 30000) { // Only log if checking every 30+ seconds
      console.debug(`WebSocket health check passed: Last message ${timeSinceLastMessage}ms ago, last heartbeat ${timeSinceLastHeartbeat}ms ago`)
    }
  }

  /**
   * Force reconnection due to health check failure
   */
  private forceReconnect(reason: string): void {
    console.log(`Forcing WebSocket reconnection: ${reason}`)
    
    // Emit health check failure event
    this.emit('healthCheckFailed', reason)
    
    // Close current connection
    this.cleanup()
    if (this.ws) {
      this.ws.close(1000, 'Health check failed')
      this.ws = null
    }
    
    // Trigger reconnection
    this.setConnectionState(ConnectionState.RECONNECTING)
    this.handleReconnect()
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
    this.stopHealthCheck()

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

// Singleton instance
let globalWebSocketService: WebSocketService | null = null

/**
 * Get or create the global WebSocket service instance
 */
export function getWebSocketService(config?: WebSocketServiceConfig): WebSocketService {
  if (!globalWebSocketService) {
    globalWebSocketService = new WebSocketService(config)
  }
  return globalWebSocketService
}

/**
 * Reset the global WebSocket service (for testing/cleanup)
 */
export function resetWebSocketService(): void {
  if (globalWebSocketService) {
    globalWebSocketService.disconnect()
    globalWebSocketService.removeAllListeners()
  }
  globalWebSocketService = null
}

// Default export for convenience
export default WebSocketService
