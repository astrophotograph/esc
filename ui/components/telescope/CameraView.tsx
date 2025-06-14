"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart3,
  Battery,
  BatteryCharging,
  BatteryFull,  // Add this import for the full battery icon
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  HardDrive,
  Thermometer,
  Target,
  RotateCw,
  Layers,
  XCircle,
  ZoomIn,
  ZoomOut,
  Maximize
} from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { useTelescopeContext } from "../../context/TelescopeContext"
import { StatsPanel } from "./panels/StatsPanel"
import { LogPanel } from "./panels/LogPanel"
import { AnnotationLayer } from "./AnnotationLayer"
import type { ScreenAnnotation } from "../../types/telescope-types"

export function CameraView() {
  const {
    isControlsCollapsed,
    selectedTarget,
    showOverlay,
    setShowOverlay,
    showStatsPanel,
    setShowStatsPanel,
    showLogPanel,
    setShowLogPanel,
    setIsControlsCollapsed,
    isTracking,
    systemStats,
    brightness,
    contrast,
    imageStats,
    showAnnotations,
    setShowAnnotations,
    annotationSettings,
    handleTargetSelect,
    celestialObjects,
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
  const imageRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

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

  // Update dimensions when image loads
  const handleImageLoad = () => {
    if (imageRef.current) {
      const { naturalWidth, naturalHeight } = imageRef.current;
      setIsPortrait(naturalHeight > naturalWidth);
      setImageDimensions({ width: naturalWidth, height: naturalHeight });

      // After determining image dimensions, also store container dimensions
      if (imageContainerRef.current) {
        setContainerDimensions({
          width: imageContainerRef.current.clientWidth,
          height: imageContainerRef.current.clientHeight
        });
      }
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

  // Modified panning implementation - handle mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      // Prevent default behavior
      e.preventDefault();

      // Calculate the movement delta
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      // Update pan position (scale by zoom level to make movement feel natural)
      setPanPosition(prev => {
        const newPos = {
          x: prev.x + dx / zoomLevel,
          y: prev.y + dy / zoomLevel
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

      // Update pan position with constraints
      setPanPosition(prev => {
        const newPos = {
          x: prev.x + dx / zoomLevel,
          y: prev.y + dy / zoomLevel
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
  const [streamStatus, setStreamStatus] = useState<any>(null);
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

  // Setup event source for streaming status
  useEffect(() => {
    const eventSource = new EventSource('/api/status/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStreamStatus(data);
        console.log("Received status update:", data);
      } catch (error) {
        console.error("Error parsing stream data:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      eventSource.close();
      const reconnectTimeout = setTimeout(() => {
        console.log("Attempting to reconnect to status stream...");
        setReconnectCounter(prev => prev + 1);
      }, 5000);

      return () => clearTimeout(reconnectTimeout);
    };

    return () => {
      eventSource.close();
    };
  }, [reconnectCounter]);

  // Reset zoom and pan
  // const resetZoomAndPan = () => {
  //   setZoomLevel(1);
  //   setPanPosition({ x: 0, y: 0 });
  // };

  // Handle mouse down for panning
  // const handleMouseDown = (e: React.MouseEvent) => {
  //   if (zoomLevel > 1) {
  //     setIsDragging(true);
  //     setDragStart({ x: e.clientX, y: e.clientY });
  //   }
  // };

  // Handle mouse move for panning
  // const handleMouseMove = (e: React.MouseEvent) => {
  //   if (isDragging && zoomLevel > 1) {
  //     const dx = e.clientX - dragStart.x;
  //     const dy = e.clientY - dragStart.y;
  //
  //     // Adjust pan position based on drag distance
  //     setPanPosition(prev => ({
  //       x: prev.x + dx,
  //       y: prev.y + dy
  //     }));
  //
  //     // Update drag start position
  //     setDragStart({ x: e.clientX, y: e.clientY });
  //   }
  // };

  // Handle mouse up to end panning
  // const handleMouseUp = () => {
  //   setIsDragging(false);
  // };

  // Handle mouse leave to end panning
  // const handleMouseLeave = () => {
  //   setIsDragging(false);
  // };

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
  const stackedFrames = streamStatus?.status?.stacked_frame || 0;
  const droppedFrames = streamStatus?.status?.dropped_frame || 0;
  const targetName = selectedTarget?.name || streamStatus?.status?.target_name;

  return (
    <div className={`transition-all duration-300 ${isControlsCollapsed ? "col-span-1" : "lg:col-span-3"}`}>
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Crosshair className="w-5 h-5" />
              Live View
              {targetName && (
                <Badge variant="outline" className="ml-2">
                  {targetName}
                </Badge>
              )}
              {/*{streamStatus && streamStatus.status && (*/}
              {/*  <Badge variant="outline" className="ml-2 bg-blue-600/20">*/}
              {/*    Status: {streamStatus.status}*/}
              {/*  </Badge>*/}
              {/*)}*/}
            </CardTitle>
            <div className="flex items-center gap-4">
              {/* System Status Indicators */}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1">
                  {streamStatus?.status?.charger_status === "Charging" ? (
                    <BatteryCharging className={`w-4 h-4 ${streamStatus?.status?.battery_capacity > 20 ? "text-green-400" : "text-red-400"}`} />
                  ) : streamStatus?.status?.charger_status === "Full" ? (
                    <BatteryFull className="w-4 h-4 text-green-400" />
                  ) : (
                    <Battery className={`w-4 h-4 ${streamStatus?.status?.battery_capacity > 20 ? "text-green-400" : "text-red-400"}`} />
                  )}
                  <span className="text-gray-300">{Math.round(streamStatus?.status?.battery_capacity)}%</span>
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
                    className={`w-4 h-4 ${streamStatus?.status?.temp < 30 ? "text-blue-400" : "text-orange-400"}`}
                  />
                  <span className="text-gray-300">{streamStatus?.status?.temp?.toFixed(1)}°C</span>
                </div>
                <div className="flex items-center gap-1">
                  <HardDrive
                    className={`w-4 h-4 ${systemStats.diskUsage < 80 ? "text-green-400" : "text-yellow-400"}`}
                  />
                  <span className="text-gray-300">{Math.round(systemStats.diskUsage)}%</span>
                </div>
                {/*{streamStatus && streamStatus.message && (*/}
                {/*  <div className="flex items-center gap-1">*/}
                {/*    <span className="text-gray-300">*/}
                {/*      {streamStatus.message}*/}
                {/*    </span>*/}
                {/*  </div>*/}
                {/*)}*/}
              </div>

              <div className="flex items-center gap-2">
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
          <div className="w-full h-[600px] bg-black rounded-lg overflow-hidden relative" ref={imageContainerRef}>
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
              <img
                ref={imageRef}
                src="http://localhost:5556/1/vid"
                alt="Telescope view"
                className="w-full h-full transition-transform duration-200 select-none"
                style={{
                  filter: `brightness(${brightness[0] + 100}%) contrast(${contrast[0]}%)`,
                  transform: `rotate(${rotationAngle}deg) scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)`,
                  transformOrigin: 'center center',
                  userSelect: 'none',
                  WebkitUserDrag: 'none',
                  userDrag: 'none',
                  MozUserSelect: 'none',
                  pointerEvents: 'none',
                  objectFit: isPortrait ? 'contain' : 'cover',
                  objectPosition: 'center',
                }}
                onLoad={handleImageLoad}
                draggable="false"
                onDragStart={(e) => e.preventDefault()}
              />
            </div>

            {/* Rest of your UI components remain the same */}
            {/* Annotation Layer with Fade Animation */}
            {/*<AnnotationLayer*/}
            {/*  showAnnotations={showAnnotations}*/}
            {/*  annotationSettings={annotationSettings}*/}
            {/*  handleAnnotationClick={handleAnnotationClick}*/}
            {/*  setHoveredObject={(obj) => setHoveredAnnotation(obj ? obj.id : null)}*/}
            {/*/>*/}
            {/*<AnnotationLayer width={800} height={600} />*/}

            {/* Status Stream Overlay */}
            {streamStatus && (
              <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-sm">
                <h3 className="font-semibold mb-1 text-blue-400">Stream Status</h3>
                <div className="text-xs text-gray-300">
                  {Object.entries(streamStatus).map(([key, value]) => (
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

            {/* Statistics Panel */}
            {showStatsPanel && <StatsPanel />}

            {/* Observation Log Panel */}
            {showLogPanel && <LogPanel />}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
