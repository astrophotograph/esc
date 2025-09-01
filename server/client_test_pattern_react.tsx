/**
 * React component example for handling telescope disconnection and test pattern display.
 * 
 * This component listens for WebSocket messages from the server and displays
 * a test pattern when a telescope disconnects.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket'; // Assuming you have a WebSocket hook

interface DisconnectionEvent {
  telescope_id: string;
  reason: string;
  disconnect_duration?: number;
  show_test_pattern?: boolean;
  timestamp?: number;
}

interface TestPatternProps {
  telescopeId: string;
  reason: string;
  duration?: number;
  onReconnect?: () => void;
}

/**
 * Test Pattern Component
 * Displays a visual test pattern when telescope is disconnected
 */
const TestPattern: React.FC<TestPatternProps> = ({ 
  telescopeId, 
  reason, 
  duration,
  onReconnect 
}) => {
  const [animationFrame, setAnimationFrame] = useState(0);
  
  // Animate the test pattern
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationFrame(prev => (prev + 1) % 8);
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  const colorBars = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF', '#000000'];
  
  return (
    <div className="test-pattern absolute inset-0 bg-black text-white flex flex-col">
      {/* Header with animated bars */}
      <div className="test-pattern-header bg-gradient-to-r from-red-500 via-green-500 to-blue-500 p-6 text-center">
        <h1 className="text-3xl font-bold animate-pulse">📡 SIGNAL LOST 📡</h1>
      </div>
      
      {/* Disconnection Info */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="bg-red-900/30 border-2 border-red-500 rounded-lg p-6 mb-8 max-w-2xl w-full">
          <h2 className="text-2xl font-bold text-center mb-4">TELESCOPE DISCONNECTED</h2>
          <div className="space-y-2 text-center">
            <p className="text-lg">Telescope: {telescopeId}</p>
            <p className="text-yellow-400">{reason}</p>
            {duration && (
              <p className="text-sm text-gray-400">
                Disconnected for {duration.toFixed(1)} seconds
              </p>
            )}
            <p className="text-sm text-gray-400">
              Time: {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
        
        {/* Color Bars */}
        <div className="w-full max-w-4xl mb-8">
          <div className="flex h-16">
            {colorBars.map((color, index) => (
              <div
                key={index}
                className="flex-1 transition-opacity duration-300"
                style={{
                  backgroundColor: color,
                  opacity: index === animationFrame ? 0.5 : 1
                }}
              />
            ))}
          </div>
        </div>
        
        {/* Test Grid Pattern */}
        <div className="grid grid-cols-8 gap-1 max-w-2xl w-full mb-8">
          {Array.from({ length: 64 }).map((_, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const isActive = (row + col + animationFrame) % 3 === 0;
            
            return (
              <div
                key={index}
                className={`aspect-square transition-colors duration-300 ${
                  isActive 
                    ? 'bg-white' 
                    : (row + col) % 2 === 0 
                      ? 'bg-gray-800' 
                      : 'bg-gray-600'
                }`}
              />
            );
          })}
        </div>
        
        {/* Reconnection Status */}
        <div className="text-center">
          <p className="text-orange-400 text-xl animate-pulse mb-4">
            ⚠️ Attempting to reconnect...
          </p>
          {onReconnect && (
            <button
              onClick={onReconnect}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Manual Reconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Telescope View Component
 * Main component that switches between normal view and test pattern
 */
export const TelescopeView: React.FC<{ telescopeId: string }> = ({ telescopeId }) => {
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [disconnectionInfo, setDisconnectionInfo] = useState<DisconnectionEvent | null>(null);
  const { messages, sendMessage, isConnected } = useWebSocket();
  
  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    
    const latestMessage = messages[messages.length - 1];
    
    // Check for telescope_lost message
    if (latestMessage.type === 'telescope_lost' && latestMessage.telescope_id === telescopeId) {
      const showTestPattern = latestMessage.payload?.show_test_pattern !== false;
      
      if (showTestPattern) {
        setIsDisconnected(true);
        setDisconnectionInfo({
          telescope_id: latestMessage.telescope_id,
          reason: latestMessage.payload?.reason || 'Connection lost',
          show_test_pattern: true
        });
      }
    }
    
    // Check for connection_lost event
    if (latestMessage.type === 'event' && 
        latestMessage.payload?.event_type === 'connection_lost' &&
        latestMessage.telescope_id === telescopeId) {
      
      const showTestPattern = latestMessage.payload.show_test_pattern !== false;
      
      if (showTestPattern) {
        setIsDisconnected(true);
        setDisconnectionInfo({
          telescope_id: latestMessage.telescope_id,
          reason: latestMessage.payload.reason || 'Connection lost',
          disconnect_duration: latestMessage.payload.disconnect_duration,
          show_test_pattern: true,
          timestamp: latestMessage.payload.timestamp
        });
      }
    }
    
    // Check for reconnection (status updates)
    if (latestMessage.type === 'status_update' && 
        latestMessage.telescope_id === telescopeId &&
        isDisconnected) {
      setIsDisconnected(false);
      setDisconnectionInfo(null);
    }
    
  }, [messages, telescopeId, isDisconnected]);
  
  // Subscribe to telescope updates on mount
  useEffect(() => {
    if (!isConnected) return;
    
    sendMessage({
      type: 'subscribe',
      telescope_id: telescopeId,
      payload: {
        subscription_types: ['status', 'all']
      }
    });
    
    return () => {
      // Unsubscribe on unmount
      sendMessage({
        type: 'unsubscribe',
        telescope_id: telescopeId,
        payload: {
          subscription_types: ['all']
        }
      });
    };
  }, [isConnected, telescopeId, sendMessage]);
  
  const handleManualReconnect = useCallback(() => {
    // Send reconnect command
    sendMessage({
      type: 'control_command',
      telescope_id: telescopeId,
      payload: {
        action: 'reconnect'
      }
    });
  }, [telescopeId, sendMessage]);
  
  if (isDisconnected && disconnectionInfo?.show_test_pattern) {
    return (
      <TestPattern
        telescopeId={disconnectionInfo.telescope_id}
        reason={disconnectionInfo.reason}
        duration={disconnectionInfo.disconnect_duration}
        onReconnect={handleManualReconnect}
      />
    );
  }
  
  // Normal telescope view
  return (
    <div className="telescope-view relative w-full h-full bg-gray-900">
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Telescope: {telescopeId}
          </h2>
          <div className="bg-gray-800 rounded-lg p-8">
            <p className="text-gray-400">Live telescope feed</p>
            {/* Your actual telescope image/video component would go here */}
            <img 
              src={`/api/telescopes/${telescopeId}/stream`} 
              alt="Telescope feed"
              className="mt-4 rounded-lg max-w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Example WebSocket hook implementation
 * (You would typically have this in a separate file)
 */
function useWebSocketExample() {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  
  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:8000/api/ws');
    
    websocket.onopen = () => {
      setIsConnected(true);
    };
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, message]);
    };
    
    websocket.onclose = () => {
      setIsConnected(false);
    };
    
    setWs(websocket);
    
    return () => {
      websocket.close();
    };
  }, []);
  
  const sendMessage = useCallback((message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, [ws]);
  
  return { messages, sendMessage, isConnected };
}