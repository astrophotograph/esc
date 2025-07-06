/**
 * WebSocket integration layer for telescope context.
 * 
 * This module provides integration between the WebSocket service
 * and the existing TelescopeContext, allowing for seamless migration
 * from HTTP/SSE to WebSocket communication.
 */

import { WebSocketService, MessageType, CommandAction, SubscriptionType, type StatusUpdateMessage, type TelescopeDiscoveredMessage, type TelescopeLostMessage } from './websocket-service'
import { featureFlags } from '../utils/feature-flags'
import type { TelescopeInfo } from '../types/telescope-types'

export interface WebSocketIntegrationCallbacks {
  onStatusUpdate: (telescopeId: string, status: Record<string, any>, changes?: string[]) => void
  onTelescopeDiscovered: (telescope: TelescopeInfo) => void
  onTelescopeLost: (telescopeId: string, reason: string) => void
  onConnectionStateChanged: (connected: boolean) => void
  onError: (error: Error) => void
}

/**
 * WebSocket integration manager
 */
export class WebSocketIntegration {
  private wsService: WebSocketService
  private callbacks: WebSocketIntegrationCallbacks
  private isInitialized = false
  private currentTelescopeId: string | null = null

  constructor(callbacks: WebSocketIntegrationCallbacks) {
    this.callbacks = callbacks
    this.wsService = new WebSocketService({
      reconnectAttempts: 10,
      reconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      heartbeatIntervalMs: 30000,
      commandTimeoutMs: 15000
    })

    this.setupEventListeners()
  }

  /**
   * Initialize WebSocket connection
   */
  async initialize(telescopeId?: string): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      this.currentTelescopeId = telescopeId || null
      
      // Connect to WebSocket
      await this.wsService.connect(telescopeId)
      
      // Subscribe to all updates by default
      await this.wsService.subscribe([SubscriptionType.ALL], telescopeId)
      
      this.isInitialized = true
      
      console.log('WebSocket integration initialized')
      
    } catch (error) {
      console.error('Failed to initialize WebSocket integration:', error)
      this.callbacks.onError(error as Error)
      throw error
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (!this.isInitialized) {
      return
    }

    this.wsService.disconnect()
    this.isInitialized = false
    this.currentTelescopeId = null
    
    console.log('WebSocket integration disconnected')
  }

  /**
   * Check if WebSocket is enabled and connected
   */
  isWebSocketEnabled(): boolean {
    return featureFlags.isEnabled('useWebSocketForStatusUpdates') && this.wsService.isConnected()
  }

  /**
   * Send a telescope control command
   */
  async sendCommand(action: CommandAction, parameters: Record<string, any> = {}, telescopeId?: string): Promise<any> {
    if (!featureFlags.isEnabled('useWebSocketForControlCommands')) {
      throw new Error('WebSocket control commands are disabled')
    }

    if (!this.wsService.isConnected()) {
      throw new Error('WebSocket not connected')
    }

    return this.wsService.sendCommand(action, parameters, telescopeId || this.currentTelescopeId || undefined)
  }

  /**
   * Subscribe to telescope updates
   */
  async subscribeToTelescope(telescopeId: string, subscriptionTypes?: SubscriptionType[]): Promise<void> {
    if (!this.wsService.isConnected()) {
      console.warn('Cannot subscribe: WebSocket not connected')
      return
    }

    await this.wsService.subscribe(subscriptionTypes, telescopeId)
  }

  /**
   * Unsubscribe from telescope updates
   */
  async unsubscribeFromTelescope(telescopeId: string, subscriptionTypes?: SubscriptionType[]): Promise<void> {
    if (!this.wsService.isConnected()) {
      return
    }

    await this.wsService.unsubscribe(subscriptionTypes, telescopeId)
  }

  /**
   * Change current telescope
   */
  async switchTelescope(telescopeId: string): Promise<void> {
    // Unsubscribe from previous telescope
    if (this.currentTelescopeId) {
      await this.unsubscribeFromTelescope(this.currentTelescopeId)
    }

    // Update current telescope
    this.currentTelescopeId = telescopeId

    // Subscribe to new telescope
    await this.subscribeToTelescope(telescopeId)
    
    console.log(`Switched to telescope: ${telescopeId}`)
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean
    state: string
    telescopeId: string | null
  } {
    return {
      connected: this.wsService.isConnected(),
      state: this.wsService.getConnectionState(),
      telescopeId: this.currentTelescopeId
    }
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    // Connection state changes
    this.wsService.on('connectionStateChanged', (state: string) => {
      const isConnected = state === 'connected'
      this.callbacks.onConnectionStateChanged(isConnected)
      
      if (featureFlags.isEnabled('enableWebSocketDebugLogs')) {
        console.log(`WebSocket connection state: ${state}`)
      }
    })

    // Status updates
    this.wsService.on(MessageType.STATUS_UPDATE, (message: StatusUpdateMessage) => {
      if (message.telescope_id) {
        this.callbacks.onStatusUpdate(
          message.telescope_id,
          message.payload.status,
          message.payload.changes
        )
        
        if (featureFlags.isEnabled('enableWebSocketDebugLogs')) {
          console.log('Status update received:', {
            telescopeId: message.telescope_id,
            changes: message.payload.changes,
            fullUpdate: message.payload.full_update
          })
        }
      }
    })

    // Telescope discovery
    this.wsService.on(MessageType.TELESCOPE_DISCOVERED, (message: TelescopeDiscoveredMessage) => {
      const telescope = message.payload.telescope as TelescopeInfo
      this.callbacks.onTelescopeDiscovered(telescope)
      
      if (featureFlags.isEnabled('enableWebSocketDebugLogs')) {
        console.log('Telescope discovered:', telescope.name)
      }
    })

    // Telescope lost
    this.wsService.on(MessageType.TELESCOPE_LOST, (message: TelescopeLostMessage) => {
      if (message.telescope_id) {
        this.callbacks.onTelescopeLost(message.telescope_id, message.payload.reason)
        
        if (featureFlags.isEnabled('enableWebSocketDebugLogs')) {
          console.log('Telescope lost:', message.telescope_id, message.payload.reason)
        }
      }
    })

    // Error handling
    this.wsService.on(MessageType.ERROR, (message: any) => {
      const error = new Error(message.payload.message || 'WebSocket error')
      this.callbacks.onError(error)
      
      console.error('WebSocket error:', message.payload)
    })

    // Reconnection events
    this.wsService.on('reconnected', () => {
      console.log('WebSocket reconnected successfully')
      
      // Re-subscribe to current telescope if any
      if (this.currentTelescopeId) {
        this.subscribeToTelescope(this.currentTelescopeId).catch(console.error)
      }
    })

    this.wsService.on('reconnectFailed', () => {
      console.error('WebSocket reconnection failed')
      this.callbacks.onError(new Error('Failed to reconnect to WebSocket'))
    })
  }
}

/**
 * Factory function to create WebSocket integration
 */
export function createWebSocketIntegration(callbacks: WebSocketIntegrationCallbacks): WebSocketIntegration {
  return new WebSocketIntegration(callbacks)
}

/**
 * Utility functions for WebSocket command mapping
 */
export const WebSocketCommands = {
  /**
   * Map telescope control actions to WebSocket commands
   */
  mapTelescopeAction(action: string, parameters: Record<string, any> = {}): { action: CommandAction; parameters: Record<string, any> } {
    switch (action) {
      case 'goto':
        return { action: CommandAction.GOTO, parameters }
      case 'move':
        return { action: CommandAction.MOVE, parameters }
      case 'park':
        return { action: CommandAction.PARK, parameters }
      case 'focus':
        return { action: CommandAction.FOCUS, parameters }
      case 'focus_increment':
        return { action: CommandAction.FOCUS_INCREMENT, parameters }
      case 'start_imaging':
        return { action: CommandAction.START_IMAGING, parameters }
      case 'stop_imaging':
        return { action: CommandAction.STOP_IMAGING, parameters }
      case 'set_gain':
        return { action: CommandAction.SET_GAIN, parameters }
      case 'set_exposure':
        return { action: CommandAction.SET_EXPOSURE, parameters }
      default:
        throw new Error(`Unknown telescope action: ${action}`)
    }
  },

  /**
   * Create parameters for goto command
   */
  createGotoParameters(ra: number, dec: number, targetName?: string): Record<string, any> {
    return {
      ra,
      dec,
      target_name: targetName
    }
  },

  /**
   * Create parameters for move command
   */
  createMoveParameters(direction: string, duration?: number): Record<string, any> {
    return {
      direction,
      duration: duration || 1000
    }
  },

  /**
   * Create parameters for focus command
   */
  createFocusParameters(position: number): Record<string, any> {
    return {
      position
    }
  },

  /**
   * Create parameters for focus increment command
   */
  createFocusIncrementParameters(increment: number): Record<string, any> {
    return {
      increment
    }
  },

  /**
   * Create parameters for gain command
   */
  createGainParameters(gain: number): Record<string, any> {
    return {
      gain
    }
  },

  /**
   * Create parameters for exposure command
   */
  createExposureParameters(exposure: number): Record<string, any> {
    return {
      exposure
    }
  }
}

export default WebSocketIntegration