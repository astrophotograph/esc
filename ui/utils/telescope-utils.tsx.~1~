"use client"

import type { StatusAlert, WeatherForecast, CelestialEvent, CelestialObjectType } from "../types/telescope-types"

// Format time for session duration display
export const formatSessionTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`
}

// Get optimal observation windows for the next 14 days
export const getOptimalObservationWindows = (weatherForecast: WeatherForecast[], celestialEvents: CelestialEvent[]) => {
  return weatherForecast
    .map((forecast, index) => ({
      ...forecast,
      dayIndex: index,
      events: celestialEvents.filter(
        (event) => Math.abs(event.date.getTime() - forecast.date.getTime()) < 24 * 60 * 60 * 1000,
      ),
    }))
    .filter((day) => day.observingScore > 60) // Only show good observing days
    .sort((a, b) => b.observingScore - a.observingScore)
    .slice(0, 7) // Top 7 days
}

// Get alert variant based on type
export const getAlertVariant = (type: StatusAlert["type"]) => {
  switch (type) {
    case "error":
      return "destructive"
    case "warning":
      return "default" // Using default for warning as it's amber/yellow
    case "success":
      return "default" // We'll style this with green text
    case "info":
    default:
      return "secondary"
  }
}

// Get icon for celestial object type
export const getObjectTypeIcon = (type: CelestialObjectType) => {
  switch (type) {
    case "galaxy":
      return <div className="w-3 h-3 rounded-full bg-purple-400"></div>
    case "nebula":
      return <div className="w-3 h-3 rounded-full bg-blue-400"></div>
    case "cluster":
      return <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
    case "planet":
      return <div className="w-3 h-3 rounded-full bg-orange-400"></div>
    case "moon":
      return <div className="w-3 h-3 rounded-full bg-gray-400"></div>
    case "double-star":
      return <div className="w-3 h-3 rounded-full bg-red-400"></div>
    default:
      return <div className="w-3 h-3 rounded-full bg-white"></div>
  }
}

// Get weather icon
export const getWeatherIcon = (condition: WeatherForecast["condition"]) => {
  const { Sun, Cloud, CloudRain, CloudSnow } = require("lucide-react")

  switch (condition) {
    case "clear":
      return <Sun className="w-4 h-4 text-yellow-400" />
    case "partly_cloudy":
      return <Cloud className="w-4 h-4 text-gray-400" />
    case "cloudy":
      return <Cloud className="w-4 h-4 text-gray-500" />
    case "overcast":
      return <Cloud className="w-4 h-4 text-gray-600" />
    case "rain":
      return <CloudRain className="w-4 h-4 text-blue-400" />
    case "snow":
      return <CloudSnow className="w-4 h-4 text-blue-200" />
    default:
      return <Cloud className="w-4 h-4 text-gray-400" />
  }
}

// Get event type icon
export const getEventTypeIcon = (type: CelestialEvent["type"]) => {
  const { Moon, Star, Zap } = require("lucide-react")

  switch (type) {
    case "moon_phase":
      return <Moon className="w-4 h-4 text-gray-300" />
    case "planet_opposition":
      return <div className="w-4 h-4 rounded-full bg-orange-400"></div>
    case "meteor_shower":
      return <Zap className="w-4 h-4 text-yellow-400" />
    case "eclipse":
      return <div className="w-4 h-4 rounded-full bg-red-400"></div>
    case "conjunction":
      return <div className="w-4 h-4 rounded-full bg-blue-400"></div>
    case "transit":
      return <div className="w-4 h-4 rounded-full bg-purple-400"></div>
    default:
      return <Star className="w-4 h-4 text-white" />
  }
}

export function formatRaDec(value: number | undefined, type: 'ra' | 'dec'): string {
  if (value === undefined) return 'N/A';

  if (type === 'ra') {
    const hours = Math.floor(value / 15);
    const minutes = Math.floor((value % 15) * 4);
    const seconds = Math.round(((value % 15) * 4 - minutes) * 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  } else {
    const sign = value >= 0 ? '+' : '-';
    const absValue = Math.abs(value);
    const degrees = Math.floor(absValue);
    const minutes = Math.floor((absValue - degrees) * 60);
    const seconds = Math.round(((absValue - degrees) * 60 - minutes) * 60);
    return `${sign}${degrees}° ${minutes}' ${seconds}"`;
  }
}

export const renderStarRating = (rating: number, interactive = false, onChange?: (rating: number) => void) => {
  const { Star } = require("lucide-react")

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${
            star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-400"
          } ${interactive ? "cursor-pointer hover:text-yellow-400" : ""}`}
          onClick={interactive && onChange ? () => onChange(star) : undefined}
        />
      ))}
    </div>
  )
}
