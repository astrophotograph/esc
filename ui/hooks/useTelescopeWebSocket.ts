import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  WebSocketService, 
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
  
  // Control functions
  moveTelescope: (direction: string) => Promise<any>;
  parkTelescope: () => Promise<any>;
  adjustFocus: (direction: 'in' | 'out') => Promise<any>;
  
  // Connection management
  connect: (telescope: TelescopeInfo) => Promise<void>;
  disconnect: () => void;
  
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
  
  // WebSocket service instance (persistent across renders)
  const wsServiceRef = useRef<WebSocketService | null>(null);
  
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [status, setStatus] = useState<TelescopeStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [currentTelescope, setCurrentTelescope] = useState<TelescopeInfo | null>(null);
  
  // Initialize WebSocket service
  useEffect(() => {
    if (!wsServiceRef.current) {
      wsServiceRef.current = new WebSocketService({
        baseUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
        reconnectAttempts: 5,
        reconnectDelayMs: 1000,
        commandTimeoutMs: 10000
      });
      
      // Set up event listeners
      const wsService = wsServiceRef.current;
      
      wsService.on('connectionStateChanged', (state: ConnectionState) => {
        setConnectionState(state);
        setIsConnected(state === ConnectionState.CONNECTED);
      });
      
      wsService.on('message', (message: any) => {
        console.log('WebSocket message received:', message);
      });
      
      wsService.on(MessageType.STATUS_UPDATE, (message: StatusUpdateMessage) => {
        console.log('Status update received:', message.payload);
        if (message.payload.status) {
          setStatus(message.payload.status);
          setLastUpdate(Date.now());
        }
      });
      
      wsService.on('reconnected', () => {
        console.log('WebSocket reconnected, re-subscribing...');
        if (currentTelescope) {
          wsService.subscribe(subscriptions, currentTelescope.serial_number || currentTelescope.id);
        }
      });
    }
    
    return () => {
      // Cleanup on unmount
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
        wsServiceRef.current.removeAllListeners();
      }
    };
  }, []);
  
  // Connect to telescope
  const connect = useCallback(async (telescope: TelescopeInfo) => {
    if (!wsServiceRef.current) return;
    
    console.log(`Connecting WebSocket to telescope: ${telescope.name}`);
    setCurrentTelescope(telescope);
    
    try {
      const telescopeId = telescope.serial_number || telescope.id;
      await wsServiceRef.current.connect(telescopeId, `client-${Date.now()}`);
      
      // Subscribe to status updates
      await wsServiceRef.current.subscribe(subscriptions, telescopeId);
      
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, [subscriptions]);
  
  // Disconnect
  const disconnect = useCallback(() => {
    if (!wsServiceRef.current) return;
    
    console.log('Disconnecting telescope WebSocket');
    wsServiceRef.current.disconnect();
    setCurrentTelescope(null);
    setStatus(null);
  }, []);
  
  // Control functions using WebSocket commands
  const moveTelescope = useCallback(async (direction: string) => {
    if (!wsServiceRef.current || !currentTelescope) {
      throw new Error('WebSocket not connected or no telescope selected');
    }
    
    console.log(`WebSocket: Moving telescope ${direction}`);
    
    return await wsServiceRef.current.sendCommand(
      CommandAction.MOVE,
      { direction },
      currentTelescope.serial_number || currentTelescope.id
    );
  }, [currentTelescope]);
  
  const parkTelescope = useCallback(async () => {
    if (!wsServiceRef.current || !currentTelescope) {
      throw new Error('WebSocket not connected or no telescope selected');
    }
    
    console.log('WebSocket: Parking telescope');
    
    return await wsServiceRef.current.sendCommand(
      CommandAction.PARK,
      {},
      currentTelescope.serial_number || currentTelescope.id
    );
  }, [currentTelescope]);
  
  const adjustFocus = useCallback(async (direction: 'in' | 'out') => {
    if (!wsServiceRef.current || !currentTelescope) {
      throw new Error('WebSocket not connected or no telescope selected');
    }
    
    const increment = direction === 'in' ? -10 : 10;
    console.log(`WebSocket: Adjusting focus ${direction} (${increment})`);
    
    return await wsServiceRef.current.sendCommand(
      CommandAction.FOCUS_INCREMENT,
      { increment },
      currentTelescope.serial_number || currentTelescope.id
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
    
    // Control functions
    moveTelescope,
    parkTelescope,
    adjustFocus,
    
    // Connection management
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
}