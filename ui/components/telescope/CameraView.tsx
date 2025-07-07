"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  HardDrive,
  Thermometer,
  RotateCw,
  Layers,
  XCircle,
  ZoomIn,
  ZoomOut,
  Maximize,
  Settings,
  Filter,
  Expand,
  Minimize
} from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { StatsPanel } from "./panels/StatsPanel"
import { LogPanel } from "./panels/LogPanel"
import { ImagingPanel } from "./panels/ImagingPanel"
import { AnnotationLayer } from "./AnnotationLayer"
import { RandomTestPattern } from "./RandomTestPattern"
import type { ScreenAnnotation } from "../../types/telescope-types"
import { generateStreamingUrl } from "../../utils/streaming"
import { WebRTCLiveView } from "./WebRTCLiveView"
import { useTelescopeWebSocket } from "../../hooks/useTelescopeWebSocket"

export function CameraView() {
  const {
    isControlsCollapsed,
    selectedTarget,
    showOverlay: _showOverlay,
    setShowOverlay: _setShowOverlay,
    showStatsPanel: _showStatsPanel,
    setShowStatsPanel: _setShowStatsPanel,
    showLogPanel: _showLogPanel,
    setShowLogPanel: _setShowLogPanel,
    setIsControlsCollapsed,
    isTracking: _isTracking,
    systemStats,
    brightness,
    contrast,
    connectionType,
    setConnectionType,
    imageStats: _imageStats,
    showAnnotations: _showAnnotations,
    setShowAnnotations: _setShowAnnotations,
    annotationSettings,
    handleTargetSelect,
    celestialObjects,
    currentTelescope,
    showStreamStatus,
    setShowStreamStatus,
    setStreamStatus,
    setFocusPosition,
    isImaging,
    liveViewFullscreen,
    setLiveViewFullscreen,
  } = useTelescopeContext()

  // Sample annotations for demonstration
  const [annotations] = useState<ScreenAnnotation[]>([
    {
      id: "vega",
      name: "Vega",
      type: "star",
      x: 25,
      y: 30,
      magnitude: 0.03,
      constellation: "Lyra",
      description: "Brightest star in Lyra, former pole star",
      catalogId: "α Lyr",
      isVisible: true,
      confidence: 0.95,
      metadata: {
        spectralClass: "A0V",
        distance: "25.04 ly",
        discoverer: "Ancient",
      },
    },
    {
      id: "altair",
      name: "Altair",
      type: "star",
      x: 70,
      y: 45,
      magnitude: 0.77,
      constellation: "Aquila",
      description: "Brightest star in Aquila",
      catalogId: "α Aql",
      isVisible: true,
      confidence: 0.92,
      metadata: {
        spectralClass: "A7V",
        distance: "16.73 ly",
      },
    },
    {
      id: "m57",
      name: "Ring Nebula",
      type: "nebula",
      x: 35,
      y: 25,
      magnitude: 8.8,
      constellation: "Lyra",
      description: "Famous planetary nebula",
      catalogId: "M57",
      isVisible: true,
      confidence: 0.88,
      metadata: {
        distance: "2,300 ly",
        size: "1.4' × 1.0'",
        discoverer: "Antoine Darquier",
        discoveryDate: "1779",
      },
    },
    {
      id: "m13",
      name: "Great Globular Cluster",
      type: "cluster",
      x: 60,
      y: 20,
      magnitude: 5.8,
      constellation: "Hercules",
      description: "Magnificent globular cluster",
      catalogId: "M13",
      isVisible: true,
      confidence: 0.91,
      metadata: {
        distance: "25,100 ly",
        size: "20'",
        discoverer: "Edmond Halley",
        discoveryDate: "1714",
      },
    },
    {
      id: "jupiter",
      name: "Jupiter",
      type: "planet",
      x: 80,
      y: 60,
      magnitude: -2.5,
      constellation: "Sagittarius",
      description: "Largest planet in our solar system",
      isVisible: true,
      confidence: 0.99,
      metadata: {
        distance: "4.2 AU",
        size: '44.8"',
      },
    },
    {
      id: "double-star-1",
      name: "Albireo",
      type: "double-star",
      x: 45,
      y: 70,
      magnitude: 3.1,
      constellation: "Cygnus",
      description: "Beautiful double star with contrasting colors",
      catalogId: "β Cyg",
      isVisible: true,
      confidence: 0.87,
      metadata: {
        spectralClass: "K3II + B8V",
        distance: "430 ly",
      },
    },
  ])
  // Existing state variables and context

  // Image aspect ratio detection
  const [isPortrait, setIsPortrait] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [lastErrorTime, setLastErrorTime] = useState<number>(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [lastSuccessfulLoad, setLastSuccessfulLoad] = useState<number>(Date.now());
  const [lastImageData, setLastImageData] = useState<string>('');
  const [streamActive, setStreamActive] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [lastSSEMessage, setLastSSEMessage] = useState<number>(Date.now());
  const imageRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket hook for real-time telescope status and control
  const {
    status: wsStatus,
    isConnected: wsConnected,
    lastUpdate: wsLastUpdate,
    connect: wsConnect,
    disconnect: wsDisconnect
  } = useTelescopeWebSocket({
    autoConnect: false
  });

  // Calculate boundaries for panning
  const calculateBoundaries = () => {
    if (!imageRef.current || !imageContainerRef.current) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const { naturalWidth, naturalHeight } = imageRef.current;
    const container = imageContainerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Determine the actual rendered size of the image
    let renderedWidth, renderedHeight;

    if (isPortrait) {
      // Portrait image fills height
      renderedHeight = containerHeight;
      renderedWidth = (naturalWidth / naturalHeight) * containerHeight;
    } else {
      // Landscape image fills width
      renderedWidth = containerWidth;
      renderedHeight = (naturalHeight / naturalWidth) * containerWidth;
    }

    // Calculate the maximum pan distance based on zoom level
    const scaledWidth = renderedWidth * zoomLevel;
    const scaledHeight = renderedHeight * zoomLevel;

    // Calculate the maximum pan distance in each direction
    // The boundaries depend on how much the image extends beyond the container when zoomed
    const maxPanX = Math.max(0, (scaledWidth - containerWidth) / (2 * zoomLevel));
    const maxPanY = Math.max(0, (scaledHeight - containerHeight) / (2 * zoomLevel));

    return {
      minX: -maxPanX,
      maxX: maxPanX,
      minY: -maxPanY,
      maxY: maxPanY
    };
  };

  // Function to constrain pan position within boundaries
  const constrainPan = (x: number, y: number) => {
    const boundaries = calculateBoundaries();

    return {
      x: Math.max(boundaries.minX, Math.min(boundaries.maxX, x)),
      y: Math.max(boundaries.minY, Math.min(boundaries.maxY, y))
    };
  };

  // Transform delta coordinates based on rotation angle
  const transformDeltaForRotation = (dx: number, dy: number) => {
    const angleRad = (rotationAngle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    return {
      x: dx * cos + dy * sin,
      y: -dx * sin + dy * cos
    };
  };

  // Validate if URL format is correct (handles both absolute and relative URLs)
  const isValidUrl = (url: string): boolean => {
    // Allow relative URLs starting with /api/
    if (url.startsWith('/api/')) {
      return true;
    }

    // Validate absolute URLs
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Generate video URL based on current telescope using streaming API
  const generateVideoUrl = (telescope: { name?: string; serial_number?: string } | null): string => {
    const url = generateStreamingUrl(telescope, 'video');
    console.log(`Generated streaming URL for telescope ${telescope?.name || 'unknown'}: ${url}`);
    return url;
  };

  // Function to capture a small sample of the image for change detection
  const captureImageSample = (): string => {
    if (!imageRef.current || imageRef.current.naturalWidth === 0) return '';

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      // Use a small sample size for performance (16x16 pixels from center)
      const sampleSize = 16;
      canvas.width = sampleSize;
      canvas.height = sampleSize;

      const img = imageRef.current;
      const centerX = img.naturalWidth / 2 - sampleSize / 2;
      const centerY = img.naturalHeight / 2 - sampleSize / 2;

      ctx.drawImage(img, centerX, centerY, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);

      // Get image data as a base64 string
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Failed to capture image sample:', error);
      return '';
    }
  };

  // Update video URL when telescope changes
  useEffect(() => {
    const newUrl = generateVideoUrl(currentTelescope);
    setVideoUrl(newUrl);

    // Reset all state when URL changes
    setImageError(false);
    setImageLoading(true);
    setRetryCount(0);
    setConnectionLost(false);
    setStreamActive(false);
    setSseConnected(false);
    setLastSuccessfulLoad(Date.now());
    setLastImageData('');
    setLastSSEMessage(Date.now());

    // Clear any pending retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Clear any pending connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // Clear stream monitoring interval
    if (streamCheckIntervalRef.current) {
      clearInterval(streamCheckIntervalRef.current);
      streamCheckIntervalRef.current = null;
    }

    // Clear SSE monitoring interval
    if (sseCheckIntervalRef.current) {
      clearInterval(sseCheckIntervalRef.current);
      sseCheckIntervalRef.current = null;
    }

    console.log(`Updated video URL for telescope: ${currentTelescope?.name || 'default'} -> ${newUrl}`);
  }, [currentTelescope]);

  // Monitor stream activity - detect if the live stream is still changing
  useEffect(() => {
    if (!streamActive || !imageRef.current) return;

    const STREAM_TIMEOUT = 30000; // 30 seconds - increased for better stability
    const CHECK_INTERVAL = 1000; // Check every second

    const checkStreamActivity = () => {
      const currentSample = captureImageSample();

      if (currentSample && lastImageData) {
        if (currentSample === lastImageData) {
          // Image hasn't changed, check if timeout exceeded
          const now = Date.now();
          const timeSinceLastChange = now - lastSuccessfulLoad;

          if (timeSinceLastChange > STREAM_TIMEOUT && !connectionLost) {
            console.log(`Stream appears frozen - ${timeSinceLastChange}ms since last change`);
            setConnectionLost(true);
          }
        } else {
          // Image has changed, update timestamp and sample
          setLastSuccessfulLoad(Date.now());
          setLastImageData(currentSample);

          // Only restore connection if both video stream and SSE are healthy
          if (connectionLost && sseConnected) {
            console.log('Stream activity detected - connection restored');
            setConnectionLost(false);
          }
        }
      } else if (currentSample) {
        // First sample capture
        setLastImageData(currentSample);
        setLastSuccessfulLoad(Date.now());
      }
    };

    // Start monitoring stream activity
    streamCheckIntervalRef.current = setInterval(checkStreamActivity, CHECK_INTERVAL);

    return () => {
      if (streamCheckIntervalRef.current) {
        clearInterval(streamCheckIntervalRef.current);
        streamCheckIntervalRef.current = null;
      }
    };
  }, [streamActive, connectionLost, lastImageData, lastSuccessfulLoad]);

  // Monitor SSE status stream health
  useEffect(() => {
    if (!sseConnected) return;

    const SSE_TIMEOUT = 30000; // 30 seconds timeout for SSE messages - increased for better stability
    const CHECK_INTERVAL = 2000; // Check every 2 seconds

    const checkSSEHealth = () => {
      const now = Date.now();
      const timeSinceLastMessage = now - lastSSEMessage;

      if (timeSinceLastMessage > SSE_TIMEOUT && !connectionLost) {
        console.log(`SSE connection appears lost - ${timeSinceLastMessage}ms since last message`);
        setConnectionLost(true);
      }
    };

    // Start monitoring SSE health
    sseCheckIntervalRef.current = setInterval(checkSSEHealth, CHECK_INTERVAL);

    return () => {
      if (sseCheckIntervalRef.current) {
        clearInterval(sseCheckIntervalRef.current);
        sseCheckIntervalRef.current = null;
      }
    };
  }, [sseConnected, connectionLost, lastSSEMessage]);

  // Update dimensions when image loads
  const handleImageLoad = () => {
    if (imageRef.current) {
      const { naturalWidth, naturalHeight } = imageRef.current;
      setIsPortrait(naturalHeight > naturalWidth);
      setImageDimensions({ width: naturalWidth, height: naturalHeight });
      setImageError(false);
      setImageLoading(false);
      setRetryCount(0); // Reset retry count on successful load
      setConnectionLost(false); // Reset connection lost state
      setStreamActive(true); // Mark stream as active
      setLastSuccessfulLoad(Date.now()); // Update last successful load time

      // Initialize image monitoring
      setTimeout(() => {
        const initialSample = captureImageSample();
        setLastImageData(initialSample);
      }, 100); // Small delay to ensure image is fully rendered

      // Clear any pending retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Clear any pending connection timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      // After determining image dimensions, also store container dimensions
      if (imageContainerRef.current) {
        setContainerDimensions({
          width: imageContainerRef.current.clientWidth,
          height: imageContainerRef.current.clientHeight
        });
      }
    }
  };

  // Handle image load error with retry logic
  const handleImageError = () => {
    const now = Date.now();
    const timeSinceLastError = now - lastErrorTime;
    const maxRetries = 5;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s

    console.warn(`Image load error for URL: ${videoUrl}, retry ${retryCount}/${maxRetries}`);

    setLastErrorTime(now);
    setStreamActive(false); // Mark stream as inactive on error

    // If we haven't exceeded max retries and enough time has passed, try again
    if (retryCount < maxRetries && timeSinceLastError > 1000) {
      setRetryCount(prev => prev + 1);
      setImageLoading(true);

      // Clear any existing retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Retry after delay
      retryTimeoutRef.current = setTimeout(() => {
        console.log(`Retrying image load after ${retryDelay}ms delay`);
        if (imageRef.current) {
          // Force reload by adding timestamp to URL
          const urlWithTimestamp = videoUrl.includes('?')
            ? `${videoUrl}&_retry=${now}`
            : `${videoUrl}?_retry=${now}`;
          imageRef.current.src = urlWithTimestamp;
        }
      }, retryDelay);
    } else {
      // Max retries exceeded or too frequent errors
      setImageError(true);
      setImageLoading(false);
      setConnectionLost(true); // Show test pattern when retries exhausted
      console.error(`Failed to load image after ${maxRetries} retries`);
    }
  };

  // Update container dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      if (imageContainerRef.current) {
        setContainerDimensions({
          width: imageContainerRef.current.clientWidth,
          height: imageContainerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cleanup timeouts and intervals on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (streamCheckIntervalRef.current) {
        clearInterval(streamCheckIntervalRef.current);
      }
      if (sseCheckIntervalRef.current) {
        clearInterval(sseCheckIntervalRef.current);
      }
    };
  }, []);

  // Modified panning implementation - handle mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      // Prevent default behavior
      e.preventDefault();

      // Calculate the movement delta
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      // Transform deltas based on rotation angle
      const transformedDelta = transformDeltaForRotation(dx, dy);

      // Update pan position (scale by zoom level to make movement feel natural)
      setPanPosition(prev => {
        const newPos = {
          x: prev.x + transformedDelta.x / zoomLevel,
          y: prev.y + transformedDelta.y / zoomLevel
        };

        // Apply constraints to keep image within bounds
        return constrainPan(newPos.x, newPos.y);
      });

      // Update the drag start position for the next move event
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  // Modified touch move handler
  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1) {
      // Prevent scrolling
      e.preventDefault();

      // Calculate the movement delta
      const dx = e.touches[0].clientX - dragStart.x;
      const dy = e.touches[0].clientY - dragStart.y;

      // Transform deltas based on rotation angle
      const transformedDelta = transformDeltaForRotation(dx, dy);

      // Update pan position with constraints
      setPanPosition(prev => {
        const newPos = {
          x: prev.x + transformedDelta.x / zoomLevel,
          y: prev.y + transformedDelta.y / zoomLevel
        };

        return constrainPan(newPos.x, newPos.y);
      });

      // Update the drag start position
      setDragStart({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      });
    }
  };

  const handleAnnotationClick = (annotation: ScreenAnnotation) => {
    if (!annotationSettings.behavior.clickToSelect) return

    // Find matching celestial object and select it
    const matchingObject = celestialObjects.find((obj) => obj.name === annotation.name)
    if (matchingObject) {
      handleTargetSelect(matchingObject)
    }
  }
  const [rotationAngle, setRotationAngle] = useState(0);
  const [localStreamStatus, setLocalStreamStatus] = useState<any>(null);
  const [reconnectCounter, setReconnectCounter] = useState(0);

  // Simplified zoom and pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset zoom and pan
  const resetZoomAndPan = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  // Simple panning implementation - handle mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent default browser drag behavior
    e.preventDefault();

    // Enable panning at any zoom level
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });

    // Change cursor style
    if (imageContainerRef.current) {
      imageContainerRef.current.style.cursor = 'grabbing';
    }
  };

  // Simple panning implementation - handle mouse up
  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // Reset cursor style
    if (imageContainerRef.current) {
      imageContainerRef.current.style.cursor = 'grab';
    }
  };

  // Simple panning implementation - handle mouse leave
  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);

      // Reset cursor style
      if (imageContainerRef.current) {
        imageContainerRef.current.style.cursor = 'grab';
      }
    }
  };

  // Simple touch support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Prevent default touch behavior
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // Modified keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (zoomLevel <= 1) return;

      const panStep = 10 / zoomLevel;
      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowLeft':
          dx = panStep;
          break;
        case 'ArrowRight':
          dx = -panStep;
          break;
        case 'ArrowUp':
          dy = panStep;
          break;
        case 'ArrowDown':
          dy = -panStep;
          break;
        default:
          return;
      }

      e.preventDefault();

      setPanPosition(prev => {
        const newPos = {
          x: prev.x + dx,
          y: prev.y + dy
        };

        return constrainPan(newPos.x, newPos.y);
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomLevel]);

  // Recalculate and apply constraints when zoom level changes
  useEffect(() => {
    if (zoomLevel === 1) {
      // Reset pan position when zoom is 1
      setPanPosition({ x: 0, y: 0 });
    } else {
      // Apply constraints to current position when zoom changes
      setPanPosition(prev => constrainPan(prev.x, prev.y));
    }
  }, [zoomLevel]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && liveViewFullscreen) {
        setLiveViewFullscreen(false)
      }
    }

    if (liveViewFullscreen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [liveViewFullscreen, setLiveViewFullscreen])

  // Setup WebSocket connection for streaming status
  useEffect(() => {
    if (!currentTelescope) {
      setLocalStreamStatus(null);
      setSseConnected(false);
      wsDisconnect();
      return;
    }

    wsConnect(currentTelescope).catch((error) => {
      console.error("WebSocket connect failed:", error);
    });

    return () => {
      wsDisconnect();
      setSseConnected(false);
    };
  }, [currentTelescope]);

  // Handle WebSocket status updates
  useEffect(() => {
    if (wsStatus) {
      setLocalStreamStatus({ status: wsStatus });
      setStreamStatus({ status: wsStatus });
      setLastSSEMessage(Date.now());

      // Update focus position from WebSocket status if available
      if (wsStatus.focus_position !== undefined && wsStatus.focus_position !== null) {
        setFocusPosition([wsStatus.focus_position]);
      }
    }
  }, [wsStatus, setStreamStatus, setFocusPosition]);

  // Handle WebSocket connection state
  useEffect(() => {
    setSseConnected(wsConnected);
    
    if (wsConnected) {
      setReconnectCounter(0);
      
      // If connection was restored and both streams are healthy
      if (connectionLost && streamActive) {
        const now = Date.now();
        const timeSinceLastImageChange = now - lastSuccessfulLoad;

        if (timeSinceLastImageChange < 30000) {
          setConnectionLost(false);
        }
      }
    } else {
      // Only mark connection as lost after multiple failures
      if (reconnectCounter > 2) {
        setConnectionLost(true);
      }
    }
  }, [wsConnected, connectionLost, streamActive, lastSuccessfulLoad, reconnectCounter]);

  // Update last message timestamp when WebSocket receives data
  useEffect(() => {
    if (wsLastUpdate > 0) {
      setLastSSEMessage(wsLastUpdate);
    }
  }, [wsLastUpdate]);

  // Zoom in function
  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 4));
  };

  // Zoom out function
  const zoomOut = () => {
    setZoomLevel(prev => {
      const newZoom = Math.max(prev - 0.25, 1);

      // If zooming back to 1, reset pan position
      if (newZoom === 1) {
        setPanPosition({ x: 0, y: 0 });
      }

      return newZoom;
    });
  };

  // Default values for frame counts if not available in stream
  const stackedFrames = localStreamStatus?.status?.stacked_frame || 0;
  const droppedFrames = localStreamStatus?.status?.dropped_frame || 0;
  const targetName = selectedTarget?.name || localStreamStatus?.status?.target_name;

  return (
    <div className={liveViewFullscreen ?
      "fixed inset-0 z-50 bg-gray-800" :
      `transition-all duration-300 ${isControlsCollapsed ? "col-span-full" : "lg:col-span-4"}`
    }>
      <Card className={liveViewFullscreen ?
        "bg-gray-800 border-none h-full rounded-none" :
        "bg-gray-800 border-gray-700"
      }>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Crosshair className="w-5 h-5" />
              Live View
              {targetName && (
                <div className="flex items-center gap-2 ml-2">
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {targetName}
                  </Badge>
                  {localStreamStatus?.status?.stage === 'Stack' && (
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  )}
                </div>
              )}
              {isImaging && (
                <div className="ml-2 flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-red-400 text-sm font-medium">REC</span>
                </div>
              )}
            </CardTitle>
            <div className="flex items-center gap-4">
              {/* System Status Indicators */}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1">
                  {localStreamStatus?.status?.charger_status === "Charging" ? (
                    <BatteryCharging className={`w-4 h-4 ${localStreamStatus?.status?.battery_capacity > 20 ? "text-green-400" : "text-red-400"}`} />
                  ) : localStreamStatus?.status?.charger_status === "Full" ? (
                    <BatteryFull className="w-4 h-4 text-green-400" />
                  ) : (
                    <Battery className={`w-4 h-4 ${localStreamStatus?.status?.battery_capacity > 20 ? "text-green-400" : "text-red-400"}`} />
                  )}
                  <span className="text-gray-300">{Math.round(localStreamStatus?.status?.battery_capacity) || 'N/A'}%</span>
                </div>

                {/* Stacked Frames Counter */}
                <div className="flex items-center gap-1">
                  <Layers className={`w-4 h-4 ${stackedFrames > 0 ? "text-blue-400" : "text-gray-400"}`} />
                  <span className="text-gray-300">{stackedFrames}</span>
                </div>

                {/* Dropped Frames Counter */}
                <div className="flex items-center gap-1">
                  <XCircle className={`w-4 h-4 ${droppedFrames > 0 ? "text-red-400" : "text-gray-400"}`} />
                  <span className="text-gray-300">{droppedFrames}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Thermometer
                    className={`w-4 h-4 ${localStreamStatus?.status?.temp < 30 ? "text-blue-400" : "text-orange-400"}`}
                  />
                  <span className="text-gray-300">{localStreamStatus?.status?.temp?.toFixed(1) || 'N/A'}°C</span>
                </div>
                <div className="flex items-center gap-1">
                  <HardDrive
                    className={`w-4 h-4 ${(localStreamStatus?.status?.freeMB && localStreamStatus?.status?.totalMB ? Math.round(((localStreamStatus?.status?.totalMB - localStreamStatus?.status?.freeMB) / localStreamStatus?.status?.totalMB) * 100) : systemStats.diskUsage) < 80 ? "text-green-400" : "text-yellow-400"}`}
                  />
                  <span className="text-gray-300" title={localStreamStatus?.status?.freeMB && localStreamStatus?.status?.totalMB ? `${localStreamStatus?.status?.freeMB}MB free of ${localStreamStatus?.status?.totalMB}MB total` : (systemStats.freeMB && systemStats.totalMB ? `${systemStats.freeMB}MB free of ${systemStats.totalMB}MB total` : undefined)}>
                    {localStreamStatus?.status?.freeMB && localStreamStatus?.status?.totalMB 
                      ? Math.round(((localStreamStatus?.status?.totalMB - localStreamStatus?.status?.freeMB) / localStreamStatus?.status?.totalMB) * 100)
                      : Math.round(systemStats.diskUsage) || 'N/A'}%
                  </span>
                </div>

                {/* Gain */}
                <div className="flex items-center gap-1">
                  <Settings className="w-4 h-4 text-purple-400" />
                  <span className="text-gray-300">{localStreamStatus?.status?.gain ?? 'N/A'}</span>
                </div>

                {/* LP Filter Status */}
                <div className="flex items-center gap-1">
                  <Filter
                    className={`w-4 h-4 ${localStreamStatus?.status?.lp_filter ? "text-amber-400" : "text-gray-400"}`}
                    title="Light Pollution Filter"
                  />
                  <span className="text-gray-300">
                    {localStreamStatus?.status?.lp_filter ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowStreamStatus(!showStreamStatus)}
                  className="text-gray-400 hover:text-white"
                  title={showStreamStatus ? "Hide Stream Status" : "Show Stream Status"}
                >
                  {showStreamStatus ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Rotate by 90 degrees on each click
                    setRotationAngle((prevAngle) => (prevAngle + 90) % 360);
                  }}
                  className="border-gray-600 text-white hover:bg-gray-700"
                >
                  <RotateCw className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLiveViewFullscreen(!liveViewFullscreen)}
                  className="border-gray-600 text-white hover:bg-gray-700"
                  title={liveViewFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {liveViewFullscreen ? <Minimize className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
                  className="border-gray-600 text-white hover:bg-gray-700"
                >
                  {isControlsCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 relative">
          <div className={`w-full bg-black overflow-hidden relative ${liveViewFullscreen ? 'h-screen rounded-none' : 'h-[calc(100vh-200px)] rounded-lg'}`} ref={imageContainerRef}>
            {/* Image container with zoom and pan */}
            <div
              className="w-full h-full cursor-grab"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            >
              {/* Show test pattern when connection is lost (only if WebRTC also reports disconnected) */}
              {connectionLost && connectionType === 'disconnected' && (
                <div className="w-full h-full flex items-center justify-center bg-black">
                  <RandomTestPattern
                    width={containerDimensions.width || 800}
                    height={containerDimensions.height || 600}
                    className="w-full h-full"
                  />
                </div>
              )}

              {/* Show placeholder only when no telescope is available (WebRTCLiveView handles its own states) */}
              {!currentTelescope && (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                  <div className="text-center text-gray-400">
                    <div className="w-24 h-24 mx-auto mb-4 bg-gray-700 rounded-lg flex items-center justify-center">
                      <Crosshair className="w-12 h-12 text-gray-500" />
                    </div>
                    <p className="text-lg font-medium mb-2">
                      {imageLoading ? 'Connecting to telescope...' : 'No telescope feed available'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {imageLoading
                        ? 'Waiting for video stream'
                        : 'Check telescope connection and try again'
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* WebRTC Live View with MJPEG fallback - handles its own error states */}
              <WebRTCLiveView
                telescope={currentTelescope}
                className=""
                brightness={brightness}
                contrast={contrast}
                rotationAngle={rotationAngle}
                zoomLevel={zoomLevel}
                panPosition={panPosition}
                isPortrait={isPortrait}
                onLoad={handleImageLoad}
                onError={handleImageError}
                onConnectionStateChange={setConnectionType}
              />
            </div>

            {/* Status Stream Overlay */}
            {localStreamStatus && showStreamStatus && (
              <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-sm">
                <h3 className="font-semibold mb-1 text-blue-400">Stream Status</h3>
                <div className="text-xs text-gray-300">
                  {Object.entries(localStreamStatus).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <span className="font-medium">{key}:</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zoom Controls */}
            <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg p-2 flex flex-col gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={zoomIn}
                className="border-gray-600 text-white hover:bg-gray-700 w-8 h-8 p-0"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>

              <div className="h-24 px-2 flex flex-col items-center">
                <Slider
                  value={[zoomLevel]}
                  min={1}
                  max={4}
                  step={0.25}
                  orientation="vertical"
                  onValueChange={(value) => {
                    setZoomLevel(value[0]);
                    if (value[0] === 1) {
                      setPanPosition({ x: 0, y: 0 });
                    }
                  }}
                  className="h-full"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={zoomOut}
                className="border-gray-600 text-white hover:bg-gray-700 w-8 h-8 p-0"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={resetZoomAndPan}
                className="border-gray-600 text-white hover:bg-gray-700 w-8 h-8 p-0 mt-2"
                title="Reset View"
              >
                <Maximize className="w-4 h-4" />
              </Button>
            </div>

            {/* Imaging Panel - shown when imaging is active */}
            {isImaging && <ImagingPanel />}

            {/* Statistics Panel - hidden when imaging */}
            {_showStatsPanel && !isImaging && <StatsPanel />}

            {/* Observation Log Panel - hidden when imaging */}
            {_showLogPanel && !isImaging && <LogPanel />}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
