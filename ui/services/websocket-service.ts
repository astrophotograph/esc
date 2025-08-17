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
  TELESCOPE_LIST = 'telescope_list',
  REQUEST_TELESCOPE_LIST = 'request_telescope_list',
  ANNOTATION_EVENT = 'annotation_event',
  CONTROL_COMMAND = 'control_command',
  COMMAND_RESPONSE = 'command_response',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  ALERT = 'alert',
  PLATE_SOLVE_RESULT = 'plate_solve_result',
  CLIENT_MODE_CHANGED = 'client_mode_changed',
  ECHO_REQUEST = 'echo_request',
  ECHO_RESPONSE = 'echo_response',
  SERVER_INIT = 'server_init',
  // Catalog operations
  CATALOG_SEARCH = 'catalog_search',
  CATALOG_SEARCH_RESPONSE = 'catalog_search_response',
  CATALOG_QUICK_SEARCH = 'catalog_quick_search',
  CATALOG_QUICK_SEARCH_RESPONSE = 'catalog_quick_search_response',
  // Remote controller operations
  REMOTE_CONTROLLERS_LIST = 'remote_controllers_list',
  REMOTE_CONTROLLERS_LIST_RESPONSE = 'remote_controllers_list_response',
  REMOTE_CONTROLLER_ADD = 'remote_controller_add',
  REMOTE_CONTROLLER_ADD_RESPONSE = 'remote_controller_add_response',
  REMOTE_CONTROLLER_REMOVE = 'remote_controller_remove',
  REMOTE_CONTROLLER_REMOVE_RESPONSE = 'remote_controller_remove_response',
  REMOTE_CONTROLLER_RECONNECT = 'remote_controller_reconnect',
  REMOTE_CONTROLLER_RECONNECT_RESPONSE = 'remote_controller_reconnect_response'
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
  GET_IMAGE_ENHANCEMENT = 'get_image_enhancement',
  REBOOT = 'reboot'
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

export interface PlateSolveResultMessage extends WebSocketMessage {
  type: MessageType.PLATE_SOLVE_RESULT
  payload: {
    job_id: string
    success: boolean
    ra?: number
    dec?: number
    orientation?: number
    pixscale?: number
    field_width?: number
    field_height?: number
    error?: string
    submission_id?: number
    astrometry_job_id?: number
  }
}

export interface ClientModeChangedMessage extends WebSocketMessage {
  type: MessageType.CLIENT_MODE_CHANGED
  payload: {
    old_mode?: string
    new_mode?: string
  }
}

export interface EchoRequestMessage extends WebSocketMessage {
  type: MessageType.ECHO_REQUEST
  payload: {
    timestamp: number
    sequence: number
  }
}

export interface EchoResponseMessage extends WebSocketMessage {
  type: MessageType.ECHO_RESPONSE
  payload: {
    request_timestamp: number
    response_timestamp: number
    sequence: number
  }
}

export interface CatalogSearchMessage extends WebSocketMessage {
  type: MessageType.CATALOG_SEARCH
  payload: {
    query?: string
    object_type?: string
    min_magnitude?: number
    max_magnitude?: number
    above_horizon_only?: boolean
    latitude?: number
    longitude?: number
    elevation?: number
    limit?: number
  }
}

export interface CatalogSearchResponseMessage extends WebSocketMessage {
  type: MessageType.CATALOG_SEARCH_RESPONSE
  payload: {
    objects: any[]
    total_count: number
    filtered_count: number
    observer_location?: {
      latitude: number
      longitude: number
      elevation: number
    }
  }
}

export interface CatalogQuickSearchMessage extends WebSocketMessage {
  type: MessageType.CATALOG_QUICK_SEARCH
  payload: {
    latitude?: number
    longitude?: number
    elevation?: number
  }
}

export interface CatalogQuickSearchResponseMessage extends WebSocketMessage {
  type: MessageType.CATALOG_QUICK_SEARCH_RESPONSE
  payload: {
    objects: any[]
    total_count: number
    filtered_count: number
    observer_location?: {
      latitude: number
      longitude: number
      elevation: number
    }
  }
}

export interface RemoteControllersListMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLERS_LIST
  payload: Record<string, never>
}

export interface RemoteControllersListResponseMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLERS_LIST_RESPONSE
  payload: {
    controllers: any[]
  }
}

export interface RemoteControllerAddMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLER_ADD
  payload: {
    host: string
    port: number
    name?: string
    description?: string
  }
}

export interface RemoteControllerAddResponseMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLER_ADD_RESPONSE
  payload: {
    success: boolean
    message?: string
    error?: string
  }
}

export interface RemoteControllerRemoveMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLER_REMOVE
  payload: {
    host: string
    port: number
  }
}

export interface RemoteControllerRemoveResponseMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLER_REMOVE_RESPONSE
  payload: {
    success: boolean
    message?: string
    error?: string
  }
}

export interface RemoteControllerReconnectMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLER_RECONNECT
  payload: {
    host: string
    port: number
  }
}

export interface RemoteControllerReconnectResponseMessage extends WebSocketMessage {
  type: MessageType.REMOTE_CONTROLLER_RECONNECT_RESPONSE
  payload: {
    success: boolean
    message?: string
    error?: string
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
  | PlateSolveResultMessage
  | ClientModeChangedMessage
  | EchoRequestMessage
  | EchoResponseMessage
  | CatalogSearchMessage
  | CatalogSearchResponseMessage
  | CatalogQuickSearchMessage
  | CatalogQuickSearchResponseMessage
  | RemoteControllersListMessage
  | RemoteControllersListResponseMessage
  | RemoteControllerAddMessage
  | RemoteControllerAddResponseMessage
  | RemoteControllerRemoveMessage
  | RemoteControllerRemoveResponseMessage
  | RemoteControllerReconnectMessage
  | RemoteControllerReconnectResponseMessage

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
  // Note: We don't store telescope ID for reconnection - we want a single global connection
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

    // WebSocket connections go directly to the backend server, not through Next.js
    // In production, this should be configured via environment variable
    // When running remotely, use the same hostname but on port 8000 for the backend
    let backendHost = process.env.NEXT_PUBLIC_BACKEND_HOST
    
    if (!backendHost && typeof window !== 'undefined') {
      // Extract hostname from current location and use port 8000 for backend
      const hostname = window.location.hostname
      backendHost = `${hostname}:8000`
    } else if (!backendHost) {
      // Fallback for server-side rendering
      backendHost = 'localhost:8000'
    }
    
    const defaultWsUrl = typeof window !== 'undefined' ?
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${backendHost}` :
      `ws://${backendHost}`
    
    this.config = {
      baseUrl: config.baseUrl || defaultWsUrl,
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

    // For the global connection, we should never have a telescope ID
    // Telescope-specific routing is handled via message payloads, not connection params
    if (telescopeId) {
      console.error('ERROR: Telescope ID provided to global WebSocket connection:', telescopeId)
      console.error('This should be handled via message payloads instead.')
      console.trace('Stack trace for telescope ID:')  // This will show us where the call is coming from
      
      // Force the telescope ID to be null to prevent per-telescope connections
      telescopeId = undefined
    }
    this.telescopeId = null  // Always null for global connection
    this.clientId = clientId || null

    this.setConnectionState(ConnectionState.CONNECTING)

    return new Promise((resolve, reject) => {
      try {
        // Always use the single WebSocket endpoint
        // Telescope-specific routing is handled via message payloads
        let wsUrl = `${this.config.baseUrl}/api/ws`

        const params = new URLSearchParams()
        if (clientId) {
          params.set('client_id', clientId)
        }
        // Never include telescope ID in URL - use message payloads instead
        // This ensures we have a single global connection
        if (params.toString()) {
          wsUrl += `?${params.toString()}`
        }

        // Check if WebSocket is available
        if (typeof WebSocket === 'undefined') {
          console.error('WebSocket is not available in this environment')
          throw new Error('WebSocket not available')
        }
        
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
          console.log('WebSocket closed:', { 
            wasClean: event.wasClean, 
            code: event.code, 
            reason: event.reason,
            connectionState: this.connectionState 
          })
          this.cleanup()

          if (!event.wasClean && this.connectionState !== ConnectionState.DISCONNECTED) {
            console.log('Triggering reconnect due to unclean close')
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
   * Request the telescope list from server
   */
  async requestTelescopeList(): Promise<void> {
    const message = {
      type: MessageType.REQUEST_TELESCOPE_LIST,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {}
    }
    
    await this.sendMessage(message as WebSocketMessage)
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
   * Search the catalog for celestial objects
   */
  async searchCatalog(params: {
    query?: string
    object_type?: string
    min_magnitude?: number
    max_magnitude?: number
    above_horizon_only?: boolean
    latitude?: number
    longitude?: number
    elevation?: number
    limit?: number
  }): Promise<any> {
    const message: CatalogSearchMessage = {
      id: this.generateMessageId(),
      type: MessageType.CATALOG_SEARCH,
      timestamp: Date.now(),
      payload: params
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(message.id)
        reject(new Error('Catalog search timeout'))
      }, this.config.commandTimeoutMs)

      this.pendingCommands.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeout
      })

      this.sendMessage(message).catch(reject)
    })
  }

  /**
   * Quick search the catalog for brightest objects
   */
  async quickSearchCatalog(
    latitude?: number,
    longitude?: number,
    elevation?: number
  ): Promise<any> {
    const message: CatalogQuickSearchMessage = {
      id: this.generateMessageId(),
      type: MessageType.CATALOG_QUICK_SEARCH,
      timestamp: Date.now(),
      payload: { latitude, longitude, elevation }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(message.id)
        reject(new Error('Catalog quick search timeout'))
      }, this.config.commandTimeoutMs)

      this.pendingCommands.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeout
      })

      this.sendMessage(message).catch(reject)
    })
  }

  /**
   * Get list of remote controllers
   */
  async getRemoteControllers(): Promise<any> {
    const message: RemoteControllersListMessage = {
      id: this.generateMessageId(),
      type: MessageType.REMOTE_CONTROLLERS_LIST,
      timestamp: Date.now(),
      payload: {}
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(message.id)
        reject(new Error('Get remote controllers timeout'))
      }, this.config.commandTimeoutMs)

      this.pendingCommands.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeout
      })

      this.sendMessage(message).catch(reject)
    })
  }

  /**
   * Add a remote controller
   */
  async addRemoteController(params: {
    host: string
    port: number
    name?: string
    description?: string
  }): Promise<any> {
    const message: RemoteControllerAddMessage = {
      id: this.generateMessageId(),
      type: MessageType.REMOTE_CONTROLLER_ADD,
      timestamp: Date.now(),
      payload: params
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(message.id)
        reject(new Error('Add remote controller timeout'))
      }, this.config.commandTimeoutMs)

      this.pendingCommands.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeout
      })

      this.sendMessage(message).catch(reject)
    })
  }

  /**
   * Remove a remote controller
   */
  async removeRemoteController(host: string, port: number): Promise<any> {
    const message: RemoteControllerRemoveMessage = {
      id: this.generateMessageId(),
      type: MessageType.REMOTE_CONTROLLER_REMOVE,
      timestamp: Date.now(),
      payload: { host, port }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(message.id)
        reject(new Error('Remove remote controller timeout'))
      }, this.config.commandTimeoutMs)

      this.pendingCommands.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeout
      })

      this.sendMessage(message).catch(reject)
    })
  }

  /**
   * Reconnect to a remote controller
   */
  async reconnectRemoteController(host: string, port: number): Promise<any> {
    const message: RemoteControllerReconnectMessage = {
      id: this.generateMessageId(),
      type: MessageType.REMOTE_CONTROLLER_RECONNECT,
      timestamp: Date.now(),
      payload: { host, port }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(message.id)
        reject(new Error('Reconnect remote controller timeout'))
      }, this.config.commandTimeoutMs)

      this.pendingCommands.set(message.id, {
        id: message.id,
        resolve,
        reject,
        timeout
      })

      this.sendMessage(message).catch(reject)
    })
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

      // Handle catalog search response
      if (message.type === MessageType.CATALOG_SEARCH_RESPONSE) {
        this.handleCatalogResponse(message as CatalogSearchResponseMessage)
        return
      }

      // Handle catalog quick search response
      if (message.type === MessageType.CATALOG_QUICK_SEARCH_RESPONSE) {
        this.handleCatalogResponse(message as CatalogQuickSearchResponseMessage)
        return
      }

      // Handle remote controller responses
      if (message.type === MessageType.REMOTE_CONTROLLERS_LIST_RESPONSE) {
        this.handleRemoteControllerResponse(message as RemoteControllersListResponseMessage)
        return
      }
      if (message.type === MessageType.REMOTE_CONTROLLER_ADD_RESPONSE) {
        this.handleRemoteControllerResponse(message as RemoteControllerAddResponseMessage)
        return
      }
      if (message.type === MessageType.REMOTE_CONTROLLER_REMOVE_RESPONSE) {
        this.handleRemoteControllerResponse(message as RemoteControllerRemoveResponseMessage)
        return
      }
      if (message.type === MessageType.REMOTE_CONTROLLER_RECONNECT_RESPONSE) {
        this.handleRemoteControllerResponse(message as RemoteControllerReconnectResponseMessage)
        return
      }

      // Handle heartbeat
      if (message.type === MessageType.HEARTBEAT) {
        this.lastHeartbeatReceived = Date.now()
        // Don't echo heartbeat back - this causes a ping-pong loop!
        // The client sends its own heartbeats on a timer
        return
      }
      
      // Handle echo request - immediately respond
      if (message.type === MessageType.ECHO_REQUEST) {
        this.handleEchoRequest(message as EchoRequestMessage)
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
   * Handle catalog response message
   */
  private handleCatalogResponse(message: CatalogSearchResponseMessage | CatalogQuickSearchResponseMessage): void {
    // Use the message ID to find the pending command
    const pendingCommand = this.pendingCommands.get(message.id)
    
    if (!pendingCommand) {
      // If no pending command, this might be a response to a request we didn't make
      return
    }

    // Clear timeout and remove from pending
    clearTimeout(pendingCommand.timeout)
    this.pendingCommands.delete(message.id)

    // Resolve with the payload
    pendingCommand.resolve(message.payload)
  }

  /**
   * Handle remote controller response message
   */
  private handleRemoteControllerResponse(
    message: RemoteControllersListResponseMessage | 
    RemoteControllerAddResponseMessage | 
    RemoteControllerRemoveResponseMessage | 
    RemoteControllerReconnectResponseMessage
  ): void {
    // Use the message ID to find the pending command
    const pendingCommand = this.pendingCommands.get(message.id)
    
    if (!pendingCommand) {
      // If no pending command, this might be a response to a request we didn't make
      return
    }

    // Clear timeout and remove from pending
    clearTimeout(pendingCommand.timeout)
    this.pendingCommands.delete(message.id)

    // For add/remove/reconnect operations, check for success/error
    if ('success' in message.payload) {
      if (message.payload.success) {
        pendingCommand.resolve(message.payload)
      } else {
        pendingCommand.reject(new Error(message.payload.error || 'Operation failed'))
      }
    } else {
      // For list operations, just return the payload
      pendingCommand.resolve(message.payload)
    }
  }
  
  /**
   * Handle echo request and send echo response
   */
  private handleEchoRequest(message: EchoRequestMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    
    // Send echo response back to server
    const response: EchoResponseMessage = {
      id: this.generateMessageId(),
      type: MessageType.ECHO_RESPONSE,
      telescope_id: message.telescope_id,
      timestamp: Date.now() / 1000,
      payload: {
        request_timestamp: message.payload.timestamp,
        response_timestamp: Date.now() / 1000,
        sequence: message.payload.sequence
      }
    }
    
    try {
      this.ws.send(JSON.stringify(response))
    } catch (error) {
      console.error('Failed to send echo response:', error)
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
        // Don't pass telescope ID on reconnect - we want a single global connection
        await this.connect(undefined, this.clientId || undefined)

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
