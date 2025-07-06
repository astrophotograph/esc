/**
 * Enhanced WebRTC Live View component that integrates with existing CameraView patterns
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useWebRTC } from '../../hooks/useWebRTC';
import type { TelescopeInfo } from '../../types/telescope-types';
import { generateStreamingUrl } from '../../utils/streaming';

interface WebRTCLiveViewProps {
  telescope: TelescopeInfo | null;
  className?: string;
  style?: React.CSSProperties;
  brightness: number[];
  contrast: number[];
  rotationAngle: number;
  zoomLevel: number;
  panPosition: { x: number; y: number };
  isPortrait: boolean;
  onLoad?: () => void;
  onError?: () => void;
  onConnectionStateChange?: (state: 'webrtc' | 'mjpeg' | 'disconnected') => void;
}

export function WebRTCLiveView({
  telescope,
  className = '',
  style = {},
  brightness,
  contrast,
  rotationAngle,
  zoomLevel,
  panPosition,
  isPortrait,
  onLoad,
  onError,
  onConnectionStateChange,
}: WebRTCLiveViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [connectionType, setConnectionType] = useState<'webrtc' | 'mjpeg' | 'disconnected'>('disconnected');
  const [enableWebRTC, setEnableWebRTC] = useState(false); // Start with MJPEG fallback
  const [mjpegUrl, setMjpegUrl] = useState<string>('');
  const [mjpegError, setMjpegError] = useState(false);
  const [mjpegLoading, setMjpegLoading] = useState(false);

  // WebRTC hook configuration
  const {
    connectionState,
    isConnecting,
    isConnected,
    error: webrtcError,
    stream,
    connect: connectWebRTC,
    disconnect: disconnectWebRTC,
    retry: retryWebRTC,
    service,
  } = useWebRTC({
    telescopeName: telescope?.name || telescope?.serial_number || 'default',
    streamType: 'live',
    autoConnect: enableWebRTC && !!telescope,
    autoReconnect: false, // Disable auto-reconnect for faster fallback
    maxReconnectAttempts: 1, // Only try once
  });

  // Generate MJPEG fallback URL
  useEffect(() => {
    if (telescope) {
      // Check if this is a test telescope
      const isTestTelescope = (
        telescope.serial_number?.toLowerCase().includes('test') ||
        telescope.name?.toLowerCase().includes('test') ||
        telescope.product_model?.toLowerCase().includes('test')
      );
      
      let url;
      if (isTestTelescope) {
        // Use WebRTC test endpoint for test telescopes
        url = '/api/webrtc/test/video-stream';
        console.log('Using WebRTC test endpoint for test telescope:', telescope.name);
      } else {
        // Use real telescope stream endpoint for actual telescopes
        url = `/api/${telescope.name}/stream`;
        console.log('Using real telescope stream endpoint for:', telescope.name);
      }
      
      setMjpegUrl(url);
      console.log('Setting MJPEG fallback URL:', url);
    }
  }, [telescope]);

  // Handle WebRTC stream assignment to video element
  useEffect(() => {
    if (videoRef.current && stream && isConnected) {
      videoRef.current.srcObject = stream;
      setConnectionType('webrtc');
      onConnectionStateChange?.('webrtc');
      onLoad?.();
    }
  }, [stream, isConnected, onLoad, onConnectionStateChange]);

  // Handle WebRTC connection state changes
  useEffect(() => {
    if (webrtcError || connectionState === 'failed') {
      console.warn('WebRTC connection failed, falling back to MJPEG:', webrtcError);
      setEnableWebRTC(false);
    } else if (connectionState === 'disconnected' && !enableWebRTC) {
      setConnectionType('disconnected');
      onConnectionStateChange?.('disconnected');
    }
  }, [webrtcError, connectionState, enableWebRTC, onConnectionStateChange]);

  // Auto-fallback to MJPEG if WebRTC doesn't work (for systems with ICE issues)
  useEffect(() => {
    if (enableWebRTC) {
      // Set a much shorter timeout to fallback quickly
      const fallbackTimer = setTimeout(() => {
        if (!isConnected) {
          console.warn('WebRTC auto-fallback: No connection established within 2s, switching to MJPEG');
          setEnableWebRTC(false);
        }
      }, 2000); // 2 second fallback

      return () => clearTimeout(fallbackTimer);
    }
  }, [enableWebRTC, isConnected]);

  // Handle MJPEG fallback
  useEffect(() => {
    if (!enableWebRTC && mjpegUrl) {
      console.log('Switching to MJPEG mode with URL:', mjpegUrl);
      setConnectionType('mjpeg');
      onConnectionStateChange?.('mjpeg');
      // Reset MJPEG error state when switching to MJPEG
      setMjpegError(false);
      setMjpegLoading(true);
    }
  }, [enableWebRTC, mjpegUrl, onConnectionStateChange]);

  // MJPEG handlers
  const handleMjpegLoad = useCallback(() => {
    setMjpegError(false);
    setMjpegLoading(false);
    if (!enableWebRTC) {
      onLoad?.();
    }
  }, [enableWebRTC, onLoad]);

  const handleMjpegError = useCallback(() => {
    setMjpegError(true);
    setMjpegLoading(false);
    if (!enableWebRTC) {
      onError?.();
    }
  }, [enableWebRTC, onError]);

  const handleMjpegLoadStart = useCallback(() => {
    setMjpegLoading(true);
    setMjpegError(false);
  }, []);

  // Retry WebRTC connection
  const handleRetryWebRTC = useCallback(async () => {
    setEnableWebRTC(true);
    setMjpegError(false);
    await retryWebRTC();
  }, [retryWebRTC]);

  // Common transform styles
  const transformStyle = {
    filter: `brightness(${brightness[0] + 100}%) contrast(${contrast[0]}%)`,
    transform: `rotate(${rotationAngle}deg) scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)`,
    transformOrigin: 'center center',
    userSelect: 'none' as const,
    MozUserSelect: 'none' as const,
    pointerEvents: 'none' as const,
    objectFit: isPortrait ? 'contain' as const : 'cover' as const,
    objectPosition: 'center',
    ...style,
  };

  // Render WebRTC video element
  if (enableWebRTC) {
    return (
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          className={`w-full h-full transition-transform duration-200 select-none ${className}`}
          style={transformStyle}
          autoPlay
          muted
          playsInline
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        />
        
        {/* WebRTC Loading/Error Overlay */}
        {(isConnecting || webrtcError) && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <div className="text-white text-center space-y-4">
              {isConnecting && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <span>Connecting via WebRTC...</span>
                </div>
              )}
              
              {webrtcError && (
                <div className="space-y-2">
                  <div className="text-red-400">WebRTC Failed</div>
                  <div className="text-sm text-gray-300">{webrtcError}</div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleRetryWebRTC}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Retry WebRTC
                    </button>
                    <button
                      onClick={() => setEnableWebRTC(false)}
                      className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                    >
                      Use MJPEG
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* WebRTC Connection Indicator */}
        {isConnected && (
          <div className="absolute top-2 left-2 bg-green-600/90 text-white px-2 py-1 rounded text-xs font-medium">
            WebRTC Live
          </div>
        )}
      </div>
    );
  }

  // Render MJPEG fallback
  return (
    <div className="relative w-full h-full">
      <img
        ref={imgRef}
        src={mjpegUrl}
        alt="Telescope view"
        className={`w-full h-full transition-transform duration-200 select-none ${
          mjpegError ? 'hidden' : ''
        } ${className}`}
        style={transformStyle}
        onLoad={handleMjpegLoad}
        onError={handleMjpegError}
        onLoadStart={handleMjpegLoadStart}
        draggable="false"
        onDragStart={(e) => e.preventDefault()}
      />

      {/* MJPEG Loading/Error Overlay */}
      {(mjpegLoading || mjpegError) && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white text-center space-y-4">
            {mjpegLoading && (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                <span>Loading MJPEG stream...</span>
              </div>
            )}
            
            {mjpegError && (
              <div className="space-y-2">
                <div className="text-red-400">Stream Error</div>
                <div className="text-sm text-gray-300">Failed to load video stream</div>
                <button
                  onClick={handleRetryWebRTC}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Try WebRTC
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MJPEG Connection Indicator */}
      {!mjpegError && !mjpegLoading && (
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <div className="bg-yellow-600/90 text-white px-2 py-1 rounded text-xs font-medium">
            MJPEG Stream
          </div>
          <button
            onClick={() => {
              console.log('User requested WebRTC trial');
              setEnableWebRTC(true);
            }}
            className="bg-blue-600/90 text-white px-2 py-1 rounded text-xs font-medium hover:bg-blue-700/90 transition-colors"
            title="Try WebRTC connection"
          >
            Try WebRTC
          </button>
        </div>
      )}
    </div>
  );
}

export default WebRTCLiveView;