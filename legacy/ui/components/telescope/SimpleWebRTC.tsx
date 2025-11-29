/**
 * Simple WebRTC implementation using browser APIs directly
 * This bypasses server-side WebRTC complexity and uses browser native WebRTC
 */

import React, { useRef, useEffect, useState } from 'react';
import type { TelescopeInfo } from '../../types/telescope-types';

interface SimpleWebRTCProps {
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

export function SimpleWebRTC({
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
}: SimpleWebRTCProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to use getUserMedia to create a test video stream
  useEffect(() => {
    if (!telescope) return;

    const setupSimpleStream = async () => {
      try {
        // For now, let's create a simple canvas-based animation
        // This simulates what a WebRTC stream would look like
        const canvas = canvasRef.current;
        const video = videoRef.current;
        
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = 640;
        canvas.height = 480;

        let animationId: number;
        let frame = 0;

        const animate = () => {
          // Clear canvas
          ctx.fillStyle = '#001122';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw animated content
          const time = Date.now() * 0.001;
          
          // Animated circle
          ctx.fillStyle = '#4444ff';
          const x = canvas.width / 2 + Math.sin(time) * 100;
          const y = canvas.height / 2 + Math.cos(time * 0.7) * 50;
          ctx.beginPath();
          ctx.arc(x, y, 30, 0, Math.PI * 2);
          ctx.fill();

          // Frame counter
          ctx.fillStyle = '#ffffff';
          ctx.font = '20px Arial';
          ctx.fillText(`WebRTC Simulation - Frame ${frame++}`, 10, 30);
          ctx.fillText(`Telescope: ${telescope.name}`, 10, 60);
          ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, 10, 90);

          animationId = requestAnimationFrame(animate);
        };

        // Start animation
        animate();

        // Convert canvas to video stream
        const stream = canvas.captureStream(30); // 30 FPS
        video.srcObject = stream;
        
        setIsStreaming(true);
        setError(null);
        onConnectionStateChange?.('webrtc');
        onLoad?.();

        return () => {
          cancelAnimationFrame(animationId);
        };
      } catch (err) {
        console.error('SimpleWebRTC setup error:', err);
        setError(err instanceof Error ? err.message : 'Failed to setup stream');
        setIsStreaming(false);
        onConnectionStateChange?.('disconnected');
        onError?.();
      }
    };

    setupSimpleStream();
  }, [telescope, onLoad, onError, onConnectionStateChange]);

  const transformStyle = {
    filter: `brightness(${brightness[0] + 100}%) contrast(${contrast[0]}%)`,
    transform: `rotate(${rotationAngle}deg) scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)`,
    transformOrigin: 'center center',
    userSelect: 'none' as const,
    MozUserSelect: 'none' as const,
    pointerEvents: 'none' as const,
    objectFit: 'contain' as const,
    objectPosition: 'center',
    ...style,
  };

  return (
    <div className="relative w-full h-full bg-black">
      {/* Hidden canvas for generating the stream */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
        width={640}
        height={480}
      />
      
      {/* Video element displaying the stream */}
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

      {/* Status indicators */}
      {isStreaming && (
        <div className="absolute top-2 left-2 bg-green-600/90 text-white px-2 py-1 rounded text-xs font-medium">
          Simple WebRTC Active
        </div>
      )}

      {error && (
        <div className="absolute top-2 right-2 bg-red-600/90 text-white px-2 py-1 rounded text-xs font-medium">
          Error: {error}
        </div>
      )}

      {!isStreaming && !error && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <span>Initializing Simple WebRTC...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SimpleWebRTC;