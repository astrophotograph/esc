import type { CelestialObject, CelestialEvent, WeatherForecast } from "../types/telescope-types"

// Sample celestial objects database
export const sampleCelestialObjects: CelestialObject[] = [
  {
    id: "m31",
    name: "M31 Andromeda Galaxy",
    type: "galaxy",
    magnitude: 3.4,
    ra: "00h 42m 44s",
    dec: "+41° 16′ 9″",
    bestSeenIn: "Autumn",
    description: "Spiral galaxy and closest major galaxy to the Milky Way",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m42",
    name: "M42 Orion Nebula",
    type: "nebula",
    magnitude: 4.0,
    ra: "05h 35m 17s",
    dec: "-05° 23′ 28″",
    bestSeenIn: "Winter",
    description: "Diffuse nebula situated in the Milky Way",
    optimalMoonPhase: "new",
    isCurrentlyVisible: false,
  },
  // Add more sample objects...
]

// Generate sample celestial events for the next 30 days
export const sampleCelestialEvents: CelestialEvent[] = (() => {
  const events: CelestialEvent[] = []
  const today = new Date()

  // Add some sample events
  events.push({
    id: "event-1",
    name: "New Moon",
    type: "moon_phase",
    date: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
    description: "Perfect time for deep sky observations with minimal light pollution",
    visibility: "excellent",
    bestViewingTime: "All night",
    duration: "1 night",
  })

  events.push({
    id: "event-2",
    name: "Jupiter Opposition",
    type: "planet_opposition",
    date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
    description: "Jupiter at its closest approach to Earth, ideal for detailed observation",
    visibility: "excellent",
    bestViewingTime: "10 PM - 4 AM",
    magnitude: -2.8,
    constellation: "Pisces",
  })

  // Add more sample events...

  return events
})()

// Generate sample weather forecast for the next 14 days
export const sampleWeatherForecast: WeatherForecast[] = (() => {
  const forecast: WeatherForecast[] = []
  const today = new Date()
  const conditions: WeatherForecast["condition"][] = ["clear", "partly_cloudy", "cloudy", "overcast", "rain"]
  const seeingConditions: WeatherForecast["seeingForecast"][] = ["excellent", "good", "fair", "poor"]

  for (let i = 0; i < 14; i++) {
    const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000)
    const condition = conditions[Math.floor(Math.random() * conditions.length)]
    const cloudCover =
      condition === "clear"
        ? Math.random() * 20
        : condition === "partly_cloudy"
          ? 20 + Math.random() * 40
          : condition === "cloudy"
            ? 60 + Math.random() * 30
            : 80 + Math.random() * 20

    const seeing =
      cloudCover < 20
        ? seeingConditions[Math.floor(Math.random() * 2)]
        : cloudCover < 50
          ? seeingConditions[1 + Math.floor(Math.random() * 2)]
          : seeingConditions[2 + Math.floor(Math.random() * 2)]

    const observingScore =
      condition === "clear"
        ? 80 + Math.random() * 20
        : condition === "partly_cloudy"
          ? 50 + Math.random() * 30
          : condition === "cloudy"
            ? 20 + Math.random() * 30
            : Math.random() * 20

    forecast.push({
      date,
      condition,
      cloudCover,
      temperature: {
        high: 15 + Math.random() * 15,
        low: 5 + Math.random() * 10,
      },
      humidity: 30 + Math.random() * 40,
      windSpeed: Math.random() * 15,
      seeingForecast: seeing,
      observingScore,
    })
  }

  return forecast
})()
