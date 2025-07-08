import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  getWebSocketService,
  CommandAction, 
  SubscriptionType, 
  ConnectionState,
  StatusUpdateMessage,
  CommandResponseMessage,
  MessageType
} from '../services/websocket-service';
import type { TelescopeInfo } from '../types/telescope-types';

export interface TelescopeStatus {
  battery_capacity?: number;
  temp?: number;
  freeMB?: number;
  totalMB?: number;
  [key: string]: any;
}

export interface UseTelescopeWebSocketOptions {
  autoConnect?: boolean;
  subscriptions?: SubscriptionType[];
}

export interface UseTelescopeWebSocketReturn {
  // Connection state
  isConnected: boolean;
  connectionState: ConnectionState;
  
  // Latest status data
  status: TelescopeStatus | null;
  lastUpdate: number;
  
  // Health monitoring
  healthStatus: {
    timeSinceLastMessage: number;
    timeSinceLastHeartbeat: number;
    lastMessageTime: number;
    lastHeartbeatReceived: number;
  } | null;
  
  // Control functions
  moveTelescope: (direction: string) => Promise<any>;
  parkTelescope: () => Promise<any>;
  adjustFocus: (direction: 'in' | 'out') => Promise<any>;
  
  // Connection management
  connect: (telescope: TelescopeInfo) => Promise<void>;
  disconnect: () => void;
  forceReconnect: (reason?: string) => void;
  
  // Manual subscription management
  subscribe: (types?: SubscriptionType[]) => Promise<void>;
  unsubscribe: (types?: SubscriptionType[]) => Promise<void>;
}

export function useTelescopeWebSocket(
  options: UseTelescopeWebSocketOptions = {}
): UseTelescopeWebSocketReturn {
  const {
    autoConnect = true,
    subscriptions = [SubscriptionType.ALL]
  } = options;
  
  // WebSocket service instance (persistent across renders) - using singleton
  const wsServiceRef = useRef<ReturnType<typeof getWebSocketService> | null>(null);
  
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [status, setStatus] = useState<TelescopeStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [currentTelescope, setCurrentTelescope] = useState<TelescopeInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    timeSinceLastMessage: number;
    timeSinceLastHeartbeat: number;
    lastMessageTime: number;
    lastHeartbeatReceived: number;
  } | null>(null);
  
  // Use refs to avoid dependency issues
  const isConnectingRef = useRef(false);
  const currentTelescopeRef = useRef<TelescopeInfo | null>(null);
  const isConnectedRef = useRef(false);
  
  // Initialize WebSocket service
  useEffect(() => {
    let wsService: ReturnType<typeof getWebSocketService>;
    let isNewServiceInstance = false;
    
    if (!wsServiceRef.current) {
      isNewServiceInstance = true;
      // Construct WebSocket URL for backend server
      const getWebSocketBaseUrl = () => {
        if (process.env.NEXT_PUBLIC_WS_URL) {
          return process.env.NEXT_PUBLIC_WS_URL;
        }
        
        if (typeof window !== 'undefined') {
          // In browser, always connect to backend on port 8000
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const hostname = window.location.hostname;
          return `${protocol}//${hostname}:8000`;
        }
        
        // Fallback for server-side rendering
        return 'ws://localhost:8000';
      };

      wsServiceRef.current = getWebSocketService({
        baseUrl: getWebSocketBaseUrl(),
        reconnectAttempts: 5,
        reconnectDelayMs: 1000,
        commandTimeoutMs: 10000
      });
    }
    
    wsService = wsServiceRef.current;
    
    // Only set up event listeners if this is a new service instance or if listeners aren't already registered
    const hasStatusListeners = wsService.listenerCount(MessageType.STATUS_UPDATE) > 0;
    
    if (isNewServiceInstance || !hasStatusListeners) {
      // Set up event listeners
      
      // Check current connection state immediately
      const currentState = wsService.getConnectionState();
      const currentlyConnected = currentState === ConnectionState.CONNECTED;
      setConnectionState(currentState);
      setIsConnected(currentlyConnected);
      isConnectedRef.current = currentlyConnected;
      
      wsService.on('connectionStateChanged', (state: ConnectionState) => {
        setConnectionState(state);
        const connected = state === ConnectionState.CONNECTED;
        setIsConnected(connected);
        isConnectedRef.current = connected;
      });
      
      wsService.on('message', (message: any) => {
        // Generic message handler for debugging if needed
      });
      
      const statusListener = (message: StatusUpdateMessage) => {
        if (message.payload.status) {
          setStatus(message.payload.status);
          setLastUpdate(Date.now());
        }
      };
      
      wsService.on(MessageType.STATUS_UPDATE, statusListener);
      
      wsService.on('reconnected', () => {
        if (currentTelescope) {
          wsService.subscribe(subscriptions, currentTelescope.serial_number || currentTelescope.id);
        }
      });

      wsService.on('healthCheckFailed', (reason: string) => {
        console.warn('WebSocket health check failed:', reason);
      });
    }

    // Set up health status monitoring
    const healthCheckInterval = setInterval(() => {
      if (wsService) {
        const health = wsService.getHealthStatus();
        setHealthStatus({
          timeSinceLastMessage: health.timeSinceLastMessage,
          timeSinceLastHeartbeat: health.timeSinceLastHeartbeat,
          lastMessageTime: health.lastMessageTime,
          lastHeartbeatReceived: health.lastHeartbeatReceived,
        });
      }
    }, 5000); // Update health status every 5 seconds
    
    return () => {
      clearInterval(healthCheckInterval);
      // Don't disconnect or remove listeners from singleton service
    };
  }, []);
  
  // Connect to telescope
  const connect = useCallback(async (telescope: TelescopeInfo) => {
    if (isConnectingRef.current) {
      return;
    }
    
    if (!wsServiceRef.current) {
      return;
    }
    
    // Check if already connected to the same telescope
    const currentTel = currentTelescopeRef.current;
    if (currentTel && (currentTel.serial_number || currentTel.id) === (telescope.serial_number || telescope.id) && isConnectedRef.current) {
      return;
    }
    
    isConnectingRef.current = true;
    setIsConnecting(true);
    setCurrentTelescope(telescope);
    currentTelescopeRef.current = telescope;
    
    try {
      const telescopeId = telescope.serial_number || telescope.id;
      await wsServiceRef.current.connect(telescopeId, `client-${Date.now()}`);
      
      // Wait longer for server-side connection to be fully established
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Subscribe to status updates
      await wsServiceRef.current.subscribe(subscriptions, telescopeId);
      
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      
      // The WebSocketService has built-in retry logic with exponential backoff
      // If this initial connection fails, the service will automatically retry
      // We don't need to manually retry here as the service handles it
      
      // The service will emit 'connectionStateChanged' events as it retries
      // so the UI will be updated automatically
    } finally {
      isConnectingRef.current = false;
      setIsConnecting(false);
    }
  }, [subscriptions]);
  
  // Disconnect
  const disconnect = useCallback(() => {
    if (!wsServiceRef.current) return;
    
    isConnectingRef.current = false;
    setIsConnecting(false);
    wsServiceRef.current.disconnect();
    setCurrentTelescope(null);
    currentTelescopeRef.current = null;
    setStatus(null);
    setHealthStatus(null);
  }, []);

  // Force reconnect
  const forceReconnect = useCallback((reason?: string) => {
    if (!wsServiceRef.current) return;
    
    const reconnectReason = reason || 'Manual reconnection requested from UI';
    console.log(`Force reconnecting WebSocket: ${reconnectReason}`);
    wsServiceRef.current.forceReconnectManual(reconnectReason);
  }, []);
  
  // Control functions using WebSocket commands
  const moveTelescope = useCallback(async (direction: string, telescope?: TelescopeInfo) => {
    const targetTelescope = telescope || currentTelescope;
    
    if (!wsServiceRef.current || !targetTelescope) {
      throw new Error('WebSocket not connected or no telescope selected');
    }
    
    return await wsServiceRef.current.sendCommand(
      CommandAction.MOVE,
      { direction },
      targetTelescope.serial_number || targetTelescope.id
    );
  }, [currentTelescope]);
  
  const parkTelescope = useCallback(async (telescope?: TelescopeInfo) => {
    const targetTelescope = telescope || currentTelescope;
    
    if (!wsServiceRef.current || !targetTelescope) {
      throw new Error('WebSocket not connected or no telescope selected');
    }
    
    return await wsServiceRef.current.sendCommand(
      CommandAction.PARK,
      {},
      targetTelescope.serial_number || targetTelescope.id
    );
  }, [currentTelescope]);
  
  const adjustFocus = useCallback(async (direction: 'in' | 'out', telescope?: TelescopeInfo) => {
    const targetTelescope = telescope || currentTelescope;
    
    if (!wsServiceRef.current || !targetTelescope) {
      throw new Error('WebSocket not connected or no telescope selected');
    }
    
    const increment = direction === 'in' ? -10 : 10;
    
    return await wsServiceRef.current.sendCommand(
      CommandAction.FOCUS_INCREMENT,
      { increment },
      targetTelescope.serial_number || targetTelescope.id
    );
  }, [currentTelescope]);
  
  // Manual subscription management
  const subscribe = useCallback(async (types: SubscriptionType[] = subscriptions) => {
    if (!wsServiceRef.current || !currentTelescope) return;
    
    const telescopeId = currentTelescope.serial_number || currentTelescope.id;
    await wsServiceRef.current.subscribe(types, telescopeId);
  }, [currentTelescope, subscriptions]);
  
  const unsubscribe = useCallback(async (types: SubscriptionType[] = subscriptions) => {
    if (!wsServiceRef.current || !currentTelescope) return;
    
    const telescopeId = currentTelescope.serial_number || currentTelescope.id;
    await wsServiceRef.current.unsubscribe(types, telescopeId);
  }, [currentTelescope, subscriptions]);
  
  return {
    // Connection state
    isConnected,
    connectionState,
    
    // Status data
    status,
    lastUpdate,
    
    // Health monitoring
    healthStatus,
    
    // Control functions
    moveTelescope,
    parkTelescope,
    adjustFocus,
    
    // Connection management
    connect,
    disconnect,
    forceReconnect,
    subscribe,
    unsubscribe,
  };
}