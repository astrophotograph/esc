/**
 * WebRTC Video component for streaming telescope video
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WebRTCService, type ConnectionState } from '../services/webrtc';

interface WebRTCVideoProps {
  telescopeName: string;
  streamType?: 'live' | 'stacked';
  className?: string;
  fallbackToMjpeg?: boolean;
  mjpegUrl?: string;
  autoConnect?: boolean;
}

export const WebRTCVideo: React.FC<WebRTCVideoProps> = ({
  telescopeName,
  streamType = 'live',
  className = '',
  fallbackToMjpeg = true,
  mjpegUrl,
  autoConnect = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [webrtcService] = useState(() => new WebRTCService());
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [useWebRTC, setUseWebRTC] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Connection quality metrics
  const [connectionQuality, setConnectionQuality] = useState({
    bitrate: 0,
    packetLoss: 0,
    latency: 0,
  });

  const connect = useCallback(async () => {
    if (isConnecting || connectionState === 'connected') return;

    setIsConnecting(true);
    setError(null);

    try {
      console.log(`Connecting to telescope ${telescopeName} with ${streamType} stream`);
      const mediaStream = await webrtcService.createSession(telescopeName, streamType);
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      console.log('WebRTC connection established');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      console.error('WebRTC connection failed:', errorMessage);
      setError(errorMessage);
      
      // Fallback to MJPEG if enabled
      if (fallbackToMjpeg && mjpegUrl) {
        console.log('Falling back to MJPEG stream');
        setUseWebRTC(false);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [telescopeName, streamType, isConnecting, connectionState, webrtcService, fallbackToMjpeg, mjpegUrl]);

  const disconnect = useCallback(async () => {
    await webrtcService.disconnect();
    setStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [webrtcService]);

  const retry = useCallback(async () => {
    await disconnect();
    setUseWebRTC(true);
    await connect();
  }, [disconnect, connect]);

  // Setup WebRTC event handlers
  useEffect(() => {
    const handleConnectionStateChange = (state: ConnectionState) => {
      console.log('WebRTC connection state:', state);
      setConnectionState(state);
    };

    const handleError = (error: Error) => {
      console.error('WebRTC error:', error);
      setError(error.message);
    };

    const handleStream = (stream: MediaStream) => {
      console.log('Received WebRTC stream');
      setStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };

    webrtcService.on('connectionStateChange', handleConnectionStateChange);
    webrtcService.on('error', handleError);
    webrtcService.on('stream', handleStream);

    return () => {
      webrtcService.off('connectionStateChange', handleConnectionStateChange);
      webrtcService.off('error', handleError);
      webrtcService.off('stream', handleStream);
    };
  }, [webrtcService]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && useWebRTC) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, useWebRTC, connect, disconnect]);

  // Monitor connection quality
  useEffect(() => {
    if (!stream || connectionState !== 'connected') return;

    const interval = setInterval(async () => {
      try {
        const stats = await webrtcService.peerConnection?.getStats();
        if (stats) {
          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              setConnectionQuality({
                bitrate: report.bytesReceived || 0,
                packetLoss: report.packetsLost || 0,
                latency: report.jitter || 0,
              });
            }
          });
        }
      } catch (error) {
        console.error('Failed to get connection stats:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [stream, connectionState, webrtcService]);

  // Render WebRTC video
  if (useWebRTC) {
    return (
      <div className={`relative ${className}`}>
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          autoPlay
          muted
          playsInline
        />
        
        {/* Connection state overlay */}
        {connectionState !== 'connected' && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white text-center">
              {isConnecting && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <span>Connecting to telescope...</span>
                </div>
              )}
              {connectionState === 'failed' && (
                <div className="space-y-2">
                  <div className="text-red-400">Connection failed</div>
                  <button
                    onClick={retry}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Retry
                  </button>
                </div>
              )}
              {connectionState === 'disconnected' && (
                <div className="space-y-2">
                  <div className="text-yellow-400">Disconnected</div>
                  <button
                    onClick={connect}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Reconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Error overlay */}
        {error && (
          <div className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded text-sm">
            {error}
            {fallbackToMjpeg && mjpegUrl && (
              <button
                onClick={() => setUseWebRTC(false)}
                className="ml-2 underline"
              >
                Use MJPEG
              </button>
            )}
          </div>
        )}
        
        {/* Connection quality indicator */}
        {connectionState === 'connected' && (
          <div className="absolute top-2 left-2 bg-green-600 text-white px-2 py-1 rounded text-xs">
            WebRTC • {streamType}
          </div>
        )}
      </div>
    );
  }

  // Fallback to MJPEG
  if (fallbackToMjpeg && mjpegUrl) {
    return (
      <div className={`relative ${className}`}>
        <img
          src={mjpegUrl}
          alt="Telescope stream"
          className="w-full h-full object-contain"
        />
        
        {/* Fallback indicator */}
        <div className="absolute top-2 left-2 bg-yellow-600 text-white px-2 py-1 rounded text-xs">
          MJPEG Fallback
        </div>
        
        {/* Switch back to WebRTC button */}
        <button
          onClick={() => setUseWebRTC(true)}
          className="absolute top-2 right-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          Try WebRTC
        </button>
      </div>
    );
  }

  // No video available
  return (
    <div className={`relative bg-gray-900 flex items-center justify-center ${className}`}>
      <div className="text-white text-center">
        <div className="text-4xl mb-4">📡</div>
        <div className="text-lg">No video stream available</div>
        <button
          onClick={connect}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Connect
        </button>
      </div>
    </div>
  );
};

export default WebRTCVideo;