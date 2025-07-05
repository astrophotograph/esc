/**
 * React hook for WebRTC telescope streaming
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WebRTCService, type ConnectionState, type WebRTCSession } from '../services/webrtc';

interface UseWebRTCOptions {
  telescopeName: string;
  streamType?: 'live' | 'stacked';
  autoConnect?: boolean;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

interface UseWebRTCReturn {
  // Connection state
  connectionState: ConnectionState;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  
  // Stream data
  stream: MediaStream | null;
  sessionInfo: WebRTCSession | null;
  
  // Connection controls
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  retry: () => Promise<void>;
  
  // WebRTC service instance
  service: WebRTCService;
}

export const useWebRTC = (options: UseWebRTCOptions): UseWebRTCReturn => {
  const {
    telescopeName,
    streamType = 'live',
    autoConnect = false,
    autoReconnect = false,
    reconnectDelay = 5000,
    maxReconnectAttempts = 3,
  } = options;

  const serviceRef = useRef<WebRTCService | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [sessionInfo, setSessionInfo] = useState<WebRTCSession | null>(null);

  // Initialize WebRTC service
  if (!serviceRef.current) {
    serviceRef.current = new WebRTCService();
  }

  const service = serviceRef.current;

  // Computed state
  const isConnected = connectionState === 'connected';

  // Clear reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Schedule reconnection
  const scheduleReconnect = useCallback(() => {
    if (!autoReconnect || reconnectAttemptsRef.current >= maxReconnectAttempts) {
      return;
    }

    clearReconnectTimeout();
    
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`Attempting reconnection ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts}`);
      connect();
    }, reconnectDelay);
  }, [autoReconnect, maxReconnectAttempts, reconnectDelay, clearReconnectTimeout]);

  // Connect to telescope
  const connect = useCallback(async () => {
    if (isConnecting || connectionState === 'connected') {
      return;
    }

    clearReconnectTimeout();
    setIsConnecting(true);
    setError(null);

    try {
      console.log(`Connecting to telescope ${telescopeName} with ${streamType} stream`);
      
      const mediaStream = await service.createSession(telescopeName, streamType);
      setStream(mediaStream);
      
      // Reset reconnect attempts on successful connection
      reconnectAttemptsRef.current = 0;
      
      console.log('WebRTC connection established');
      
      // Get session info
      const session = await service.getSession();
      setSessionInfo(session);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      console.error('WebRTC connection failed:', errorMessage);
      setError(errorMessage);
      
      // Schedule reconnection if enabled
      if (autoReconnect) {
        reconnectAttemptsRef.current++;
        scheduleReconnect();
      }
    } finally {
      setIsConnecting(false);
    }
  }, [
    telescopeName,
    streamType,
    isConnecting,
    connectionState,
    service,
    autoReconnect,
    scheduleReconnect,
    clearReconnectTimeout,
  ]);

  // Disconnect from telescope
  const disconnect = useCallback(async () => {
    clearReconnectTimeout();
    reconnectAttemptsRef.current = 0;
    
    await service.disconnect();
    setStream(null);
    setSessionInfo(null);
    setError(null);
  }, [service, clearReconnectTimeout]);

  // Retry connection (resets attempt counter)
  const retry = useCallback(async () => {
    reconnectAttemptsRef.current = 0;
    await disconnect();
    await connect();
  }, [disconnect, connect]);

  // Setup WebRTC event handlers
  useEffect(() => {
    const handleConnectionStateChange = (state: ConnectionState) => {
      console.log('WebRTC connection state:', state);
      setConnectionState(state);
      
      // Handle automatic reconnection
      if ((state === 'failed' || state === 'disconnected') && autoReconnect) {
        scheduleReconnect();
      }
    };

    const handleError = (error: Error) => {
      console.error('WebRTC error:', error);
      setError(error.message);
    };

    const handleStream = (stream: MediaStream) => {
      console.log('Received WebRTC stream');
      setStream(stream);
    };

    const handleDisconnected = () => {
      console.log('WebRTC disconnected');
      setStream(null);
      setSessionInfo(null);
    };

    service.on('connectionStateChange', handleConnectionStateChange);
    service.on('error', handleError);
    service.on('stream', handleStream);
    service.on('disconnected', handleDisconnected);

    return () => {
      service.off('connectionStateChange', handleConnectionStateChange);
      service.off('error', handleError);
      service.off('stream', handleStream);
      service.off('disconnected', handleDisconnected);
    };
  }, [service, autoReconnect, scheduleReconnect]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect]); // Only run on mount/unmount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      disconnect();
    };
  }, [disconnect, clearReconnectTimeout]);

  return {
    // Connection state
    connectionState,
    isConnecting,
    isConnected,
    error,
    
    // Stream data
    stream,
    sessionInfo,
    
    // Connection controls
    connect,
    disconnect,
    retry,
    
    // Service instance
    service,
  };
};

export default useWebRTC;