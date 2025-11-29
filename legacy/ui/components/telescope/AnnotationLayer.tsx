"use client"

import { useState, useEffect } from "react"
import type { ScreenAnnotation, AnnotationSettings, AnnotationType } from "../../types/telescope-types"

interface AnnotationLayerProps {
  showAnnotations: boolean
  annotationSettings: AnnotationSettings
  handleAnnotationClick: (obj: ScreenAnnotation) => void
  setHoveredObject: (obj: ScreenAnnotation | null) => void
}

export function AnnotationLayer({
  showAnnotations,
  annotationSettings,
  handleAnnotationClick,
  setHoveredObject,
}: AnnotationLayerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  // Sample annotation data - in a real app, this would come from star catalogs or image analysis
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

  // Handle fade animations
  useEffect(() => {
    const shouldShow = showAnnotations && annotationSettings.enabled

    if (shouldShow) {
      setShouldRender(true)
      // Small delay to ensure DOM is ready for animation
      setTimeout(() => setIsVisible(true), 10)
    } else {
      setIsVisible(false)
      // Wait for fade out animation to complete before unmounting
      setTimeout(() => setShouldRender(false), 300)
    }
  }, [showAnnotations, annotationSettings.enabled])

  // Check both the global toggle AND the annotation settings
  if (!shouldRender) {
    return null
  }

  const getAnnotationColor = (type: AnnotationType): string => {
    const colors = {
      star: "#FFD700",
      galaxy: "#9370DB",
      nebula: "#FF69B4",
      cluster: "#32CD32",
      planet: "#FFA500",
      moon: "#C0C0C0",
      "double-star": "#FF6347",
      "variable-star": "#FFB6C1",
      asteroid: "#8B4513",
      comet: "#00CED1",
    }
    return colors[type] || "#FFFFFF"
  }

  const getAnnotationSize = (magnitude?: number, type?: AnnotationType): number => {
    if (!magnitude) return 20

    // Brighter objects (lower magnitude) get larger circles
    let baseSize = Math.max(10, 30 - magnitude * 3)

    // Adjust size based on object type
    switch (type) {
      case "planet":
        baseSize *= 1.5
        break
      case "galaxy":
      case "nebula":
        baseSize *= 1.2
        break
      case "cluster":
        baseSize *= 1.1
        break
      default:
        break
    }

    return Math.min(50, Math.max(8, baseSize))
  }

  const shouldShowAnnotation = (annotation: ScreenAnnotation): boolean => {
    if (!annotation.isVisible) return false

    // Check magnitude filter
    if (annotation.magnitude !== undefined) {
      if (
        annotation.magnitude < annotationSettings.minMagnitude ||
        annotation.magnitude > annotationSettings.maxMagnitude
      ) {
        return false
      }
    }

    // Check object type filter
    const typeMap = {
      star: annotationSettings.objectTypes.stars,
      galaxy: annotationSettings.objectTypes.galaxies,
      nebula: annotationSettings.objectTypes.nebulae,
      cluster: annotationSettings.objectTypes.clusters,
      planet: annotationSettings.objectTypes.planets,
      moon: annotationSettings.objectTypes.moons,
      "double-star": annotationSettings.objectTypes.doubleStars,
      "variable-star": annotationSettings.objectTypes.variableStars,
      asteroid: annotationSettings.objectTypes.asteroids,
      comet: annotationSettings.objectTypes.comets,
    }

    return typeMap[annotation.type] ?? true
  }

  const filteredAnnotations = annotations.filter(shouldShowAnnotation)

  return (
    <div
      className={`absolute inset-0 pointer-events-none transition-all duration-300 ease-in-out ${
        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
      style={{
        transform: isVisible ? "translateY(0)" : "translateY(-10px)",
      }}
    >
      {filteredAnnotations.map((annotation, index) => {
        const size = getAnnotationSize(annotation.magnitude, annotation.type)
        const color = getAnnotationColor(annotation.type)
        const isHovered = false // We'll implement this later

        return (
          <div
            key={`${annotation.type}-${annotation.name}`}
            className={`absolute transition-all duration-300 ease-out ${
              isVisible ? "opacity-100 scale-100" : "opacity-0 scale-80"
            } pointer-events-auto`}
            style={{
              left: `${annotation.x}%`,
              top: `${annotation.y}%`,
              transform: `translate(-50%, -50%)`,
              transitionDelay: isVisible ? `${index * 50}ms` : "0ms",
            }}
            onClick={() => handleAnnotationClick(annotation)}
            onMouseEnter={() => setHoveredObject(annotation)}
            onMouseLeave={() => setHoveredObject(null)}
          >
            {/* Main circle */}
            <svg
              width={size}
              height={size}
              viewBox="0 0 100 100"
              className={`transition-all duration-300 ${isHovered ? "animate-pulse" : ""}`}
            >
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={color}
                strokeWidth={annotationSettings.appearance.circleThickness * 2}
                strokeOpacity={annotationSettings.appearance.circleOpacity}
              />

              {/* Confidence indicator (inner circle) */}
              <circle cx="50" cy="50" r={45 * annotation.confidence} fill={color} fillOpacity={0.1} />

              {/* Type-specific indicators */}
              {annotation.type === "double-star" && (
                <circle
                  cx="65"
                  cy="35"
                  r="20"
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  strokeOpacity={annotationSettings.appearance.circleOpacity * 0.7}
                />
              )}
            </svg>

            {/* Label */}
            {annotationSettings.showLabels && (
              <div
                className="absolute left-1/2 transform -translate-x-1/2 -translate-y-full -top-2 whitespace-nowrap"
                style={{
                  opacity: annotationSettings.appearance.labelOpacity,
                }}
              >
                <div className="bg-black/70 px-2 py-0.5 rounded text-center">
                  <div
                    className="text-xs font-mono"
                    style={{
                      color,
                      fontSize: annotationSettings.appearance.fontSize,
                    }}
                  >
                    {annotation.name}
                  </div>

                  {/* Magnitude */}
                  {annotationSettings.showMagnitudes && annotation.magnitude !== undefined && (
                    <div
                      className="text-xs font-mono opacity-80"
                      style={{
                        color,
                        fontSize: annotationSettings.appearance.fontSize - 2,
                      }}
                    >
                      {annotation.magnitude.toFixed(1)}
                    </div>
                  )}
                </div>

                {/* Constellation */}
                {annotationSettings.showConstellations && annotation.constellation && (
                  <div
                    className="text-xs font-mono text-center opacity-60 mt-1"
                    style={{
                      color,
                      fontSize: annotationSettings.appearance.fontSize - 3,
                    }}
                  >
                    {annotation.constellation}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
