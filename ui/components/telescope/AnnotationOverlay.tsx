import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

export interface Annotation {
  type: string;
  pixelx: number;
  pixely: number;
  radius: number;
  name: string;
  names: string[];
}

interface AnnotationOverlayProps {
  annotations: Annotation[];
  visible: boolean;
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  isPortrait: boolean;
}

// Color mapping for different annotation types
const typeColors: Record<string, string> = {
  ngc: 'bg-blue-500/80',
  ic: 'bg-green-500/80', 
  sh2: 'bg-red-500/80',
  messier: 'bg-purple-500/80',
  planet: 'bg-yellow-500/80',
  star: 'bg-white/80',
  default: 'bg-gray-500/80'
};

// Get appropriate color for annotation type
const getTypeColor = (type: string): string => {
  return typeColors[type.toLowerCase()] || typeColors.default;
};

// Format names for display
const formatNames = (names: string[]): string => {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  
  // If multiple names, show the first one prominently
  const primary = names[0];
  const secondary = names.slice(1);
  
  if (secondary.length === 1) {
    return `${primary} (${secondary[0]})`;
  } else {
    return `${primary} (+${secondary.length} more)`;
  }
};

export function AnnotationOverlay({
  annotations,
  visible,
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
  zoom,
  rotation,
  offsetX,
  offsetY,
  isPortrait: _isPortrait
}: AnnotationOverlayProps) {
  // Don't render anything if no annotations, but allow fade out when visible is false
  if (annotations.length === 0) {
    return null;
  }

  // Track if we're on the client side to avoid SSR issues
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);


  // Calculate the actual displayed image size within the container
  const calculateActualImageSize = () => {
    // If we don't have real image dimensions, or if they're the fallback values (800x600),
    // we need to try to get the actual video/image dimensions from the DOM
    let actualImageWidth = imageWidth;
    let actualImageHeight = imageHeight;
    
    if (imageWidth === 0 || imageHeight === 0 || (imageWidth === 800 && imageHeight === 600)) {
      // Try to find the actual video or image element and get its intrinsic dimensions
      // Only do this in the browser environment and after client-side hydration
      if (isClient && typeof window !== 'undefined') {
        const videoElement = document.querySelector('video') as HTMLVideoElement;
        const imageElement = document.querySelector('img[alt="Telescope view"]') as HTMLImageElement;
        
        if (videoElement && videoElement.videoWidth && videoElement.videoHeight) {
          actualImageWidth = videoElement.videoWidth;
          actualImageHeight = videoElement.videoHeight;
        } else if (imageElement && imageElement.naturalWidth && imageElement.naturalHeight) {
          actualImageWidth = imageElement.naturalWidth;
          actualImageHeight = imageElement.naturalHeight;
        } else {
          // Still no real dimensions, assume container fills entirely
          return { width: containerWidth, height: containerHeight, offsetX: 0, offsetY: 0 };
        }
      } else {
        // Server-side rendering, use container size
        return { width: containerWidth, height: containerHeight, offsetX: 0, offsetY: 0 };
      }
    }

    const containerAspect = containerWidth / containerHeight;
    const imageAspect = actualImageWidth / actualImageHeight;
    
    let actualWidth, actualHeight, imgOffsetX = 0, imgOffsetY = 0;
    
    if (imageAspect > containerAspect) {
      // Image is wider than container - fit by width
      actualWidth = containerWidth;
      actualHeight = containerWidth / imageAspect;
      imgOffsetY = (containerHeight - actualHeight) / 2;
    } else {
      // Image is taller than container - fit by height
      actualHeight = containerHeight;
      actualWidth = containerHeight * imageAspect;
      imgOffsetX = (containerWidth - actualWidth) / 2;
    }
    
    return { 
      width: actualWidth, 
      height: actualHeight, 
      offsetX: imgOffsetX, 
      offsetY: imgOffsetY 
    };
  };

  const actualImageSize = calculateActualImageSize();
  

  // Transform annotation coordinates based on zoom, rotation, and offset
  const transformCoordinates = (annotation: Annotation) => {
    // Try to get the real video dimensions we detected earlier
    let transformImageWidth = imageWidth;
    let transformImageHeight = imageHeight;
    
    // If we have fallback dimensions but detected real video dimensions, use those for transformation
    const shouldUseRealDimensions = (imageWidth === 0 || imageHeight === 0 || (imageWidth === 800 && imageHeight === 600)) && isClient;
    
    if (shouldUseRealDimensions) {
      // Try to find video or image elements
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      const imageElement = document.querySelector('img[alt="Telescope view"]') as HTMLImageElement;
      
      
      // Try video first, then image
      if (videoElement && videoElement.videoWidth && videoElement.videoHeight) {
        transformImageWidth = videoElement.videoWidth;
        transformImageHeight = videoElement.videoHeight;
      } else if (imageElement && imageElement.naturalWidth && imageElement.naturalHeight) {
        transformImageWidth = imageElement.naturalWidth;
        transformImageHeight = imageElement.naturalHeight;
      }
    }
    
    // If we still don't have real dimensions, we can't transform coordinates accurately
    if (transformImageWidth === 0 || transformImageHeight === 0 || (transformImageWidth === 800 && transformImageHeight === 600 && !isClient)) {
      return { x: 0, y: 0, visible: false };
    }
    
    // Convert annotation pixel coordinates to relative coordinates (0-1) based on original image
    const relativeX = annotation.pixelx / transformImageWidth;
    const relativeY = annotation.pixely / transformImageHeight;
    
    
    // Since we're now applying CSS transforms to the overlay container,
    // we just need to convert to image coordinates without manual zoom/pan/rotation
    const imageX = relativeX * actualImageSize.width;
    const imageY = relativeY * actualImageSize.height;
    
    
    const screenX = imageX;
    const screenY = imageY;
    
    // Check if annotation is visible within the actual image bounds
    const isVisible = screenX >= 0 && screenX <= actualImageSize.width && 
                     screenY >= 0 && screenY <= actualImageSize.height;
    
    return {
      x: screenX,
      y: screenY,
      visible: isVisible
    };
  };

  // Apply the same transform as the image element
  const overlayTransform = `rotate(${rotation * 180 / Math.PI}deg) scale(${zoom}) translate(${offsetX}px, ${offsetY}px)`;

  return (
    <div 
      className={`absolute pointer-events-none ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: `${actualImageSize.offsetX}px`,
        top: `${actualImageSize.offsetY}px`,
        width: `${actualImageSize.width}px`,
        height: `${actualImageSize.height}px`,
        transform: overlayTransform,
        transformOrigin: 'center center',
        transition: 'opacity 300ms ease, transform 200ms ease',
      }}
    >
      {/* Overlay tint */}
      <div className="absolute inset-0 bg-black/10" />
      {annotations.map((annotation, index) => {
        const transformed = transformCoordinates(annotation);
        
        if (!transformed.visible) {
          return null;
        }

        const displayName = annotation.name || formatNames(annotation.names);
        const typeColor = getTypeColor(annotation.type);

        return (
          <div
            key={index}
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${transformed.x}px`,
              top: `${transformed.y}px`,
            }}
          >
            {/* Circle based on radius */}
            {annotation.radius > 0 && (
              <div 
                className="absolute border-2 border-yellow-400 opacity-80 rounded-full"
                style={{
                  width: `${Math.max(annotation.radius * 2 * zoom, 4)}px`,
                  height: `${Math.max(annotation.radius * 2 * zoom, 4)}px`,
                  left: `${-Math.max(annotation.radius * zoom, 2)}px`,
                  top: `${-Math.max(annotation.radius * zoom, 2)}px`,
                }}
              />
            )}
            
            {/* Crosshair marker */}
            <div className="relative">
              {/* Horizontal line */}
              <div 
                className="absolute bg-yellow-400 opacity-80"
                style={{
                  width: '20px',
                  height: '1px',
                  left: '-10px',
                  top: '0px'
                }}
              />
              {/* Vertical line */}
              <div 
                className="absolute bg-yellow-400 opacity-80"
                style={{
                  width: '1px',
                  height: '20px',
                  left: '0px',
                  top: '-10px'
                }}
              />
              {/* Center dot */}
              <div 
                className="absolute bg-yellow-400 rounded-full"
                style={{
                  width: '3px',
                  height: '3px',
                  left: '-1.5px',
                  top: '-1.5px'
                }}
              />
            </div>

            {/* Label */}
            {displayName && (
              <div
                className="absolute top-3 left-1/2 transform -translate-x-1/2 pointer-events-auto"
                style={{ minWidth: 'max-content' }}
              >
                <Badge 
                  variant="secondary" 
                  className={`text-xs font-medium text-white border-0 ${typeColor} shadow-lg`}
                >
                  <span className="uppercase text-xs font-bold mr-1">
                    {annotation.type}
                  </span>
                  {displayName}
                </Badge>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}