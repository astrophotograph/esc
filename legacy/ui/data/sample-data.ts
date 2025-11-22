import type { CelestialObject, CelestialEvent, WeatherForecast } from "../types/telescope-types"

// Sample celestial objects database
export const sampleCelestialObjects: CelestialObject[] = [
  // Planets
  {
    id: "mercury",
    name: "Mercury",
    type: "planet",
    magnitude: -0.4,
    ra: "14h 30m 00s",
    dec: "-12° 45′ 00″",
    bestSeenIn: "Evening twilight",
    description: "Innermost planet of the solar system",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  {
    id: "venus",
    name: "Venus",
    type: "planet",
    magnitude: -4.6,
    ra: "20h 15m 00s",
    dec: "-18° 30′ 00″",
    bestSeenIn: "Evening",
    description: "Brightest object in the night sky after Moon",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  {
    id: "mars",
    name: "Mars",
    type: "planet",
    magnitude: -1.8,
    ra: "02h 45m 00s",
    dec: "+15° 20′ 00″",
    bestSeenIn: "Evening",
    description: "The Red Planet",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  {
    id: "jupiter",
    name: "Jupiter",
    type: "planet",
    magnitude: -2.7,
    ra: "22h 10m 00s",
    dec: "-11° 15′ 00″",
    bestSeenIn: "Evening",
    description: "Largest planet in our solar system",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  {
    id: "saturn",
    name: "Saturn",
    type: "planet",
    magnitude: 0.7,
    ra: "21h 30m 00s",
    dec: "-16° 45′ 00″",
    bestSeenIn: "Evening",
    description: "Ringed planet with beautiful ring system",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  // Sun and Moon
  {
    id: "sun",
    name: "Sun",
    type: "planet", // Using planet type for filtering
    magnitude: -26.7,
    ra: "12h 00m 00s",
    dec: "00° 00′ 00″",
    bestSeenIn: "Daytime",
    description: "Our star - WARNING: Never observe directly without proper solar filters",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  {
    id: "moon",
    name: "Moon",
    type: "moon",
    magnitude: -12.6,
    ra: "08h 15m 00s",
    dec: "+20° 30′ 00″",
    bestSeenIn: "Night",
    description: "Earth's natural satellite",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  // Messier Objects
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
  {
    id: "m1",
    name: "M1 Crab Nebula",
    type: "nebula",
    magnitude: 8.4,
    ra: "05h 34m 32s",
    dec: "+22° 00′ 52″",
    bestSeenIn: "Winter",
    description: "Supernova remnant in Taurus",
    optimalMoonPhase: "new",
    isCurrentlyVisible: false,
  },
  {
    id: "m13",
    name: "M13 Hercules Cluster",
    type: "cluster",
    magnitude: 5.8,
    ra: "16h 41m 41s",
    dec: "+36° 27′ 35″",
    bestSeenIn: "Summer",
    description: "Great globular cluster in Hercules",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m57",
    name: "M57 Ring Nebula",
    type: "nebula",
    magnitude: 8.8,
    ra: "18h 53m 36s",
    dec: "+33° 01′ 45″",
    bestSeenIn: "Summer",
    description: "Planetary nebula in Lyra",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m45",
    name: "M45 Pleiades",
    type: "cluster",
    magnitude: 1.6,
    ra: "03h 47m 29s",
    dec: "+24° 07′ 00″",
    bestSeenIn: "Winter",
    description: "Seven Sisters open star cluster",
    optimalMoonPhase: "any",
    isCurrentlyVisible: false,
  },
  {
    id: "m51",
    name: "M51 Whirlpool Galaxy",
    type: "galaxy",
    magnitude: 8.4,
    ra: "13h 29m 53s",
    dec: "+47° 11′ 43″",
    bestSeenIn: "Spring",
    description: "Interacting grand-design spiral galaxy",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m104",
    name: "M104 Sombrero Galaxy",
    type: "galaxy",
    magnitude: 8.0,
    ra: "12h 39m 59s",
    dec: "-11° 37′ 23″",
    bestSeenIn: "Spring",
    description: "Spiral galaxy with prominent dust lane",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m8",
    name: "M8 Lagoon Nebula",
    type: "nebula",
    magnitude: 6.0,
    ra: "18h 03m 37s",
    dec: "-24° 23′ 12″",
    bestSeenIn: "Summer",
    description: "Emission nebula in Sagittarius",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m20",
    name: "M20 Trifid Nebula",
    type: "nebula",
    magnitude: 9.0,
    ra: "18h 02m 23s",
    dec: "-23° 01′ 48″",
    bestSeenIn: "Summer",
    description: "Combination emission and reflection nebula",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m3",
    name: "M3 Globular Cluster",
    type: "cluster",
    magnitude: 6.2,
    ra: "13h 42m 11s",
    dec: "+28° 22′ 38″",
    bestSeenIn: "Spring",
    description: "Globular cluster in Canes Venatici",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m81",
    name: "M81 Bode's Galaxy",
    type: "galaxy",
    magnitude: 6.9,
    ra: "09h 55m 33s",
    dec: "+69° 03′ 55″",
    bestSeenIn: "Spring",
    description: "Spiral galaxy in Ursa Major",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  {
    id: "m82",
    name: "M82 Cigar Galaxy",
    type: "galaxy",
    magnitude: 8.4,
    ra: "09h 55m 52s",
    dec: "+69° 40′ 47″",
    bestSeenIn: "Spring",
    description: "Starburst galaxy in Ursa Major",
    optimalMoonPhase: "new",
    isCurrentlyVisible: true,
  },
  // Double Stars
  {
    id: "albireo",
    name: "Albireo",
    type: "double-star",
    magnitude: 3.1,
    ra: "19h 30m 43s",
    dec: "+27° 57′ 35″",
    bestSeenIn: "Summer",
    description: "Beautiful double star in Cygnus - gold and blue",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
  {
    id: "double-double",
    name: "Double-Double",
    type: "double-star",
    magnitude: 4.7,
    ra: "18h 44m 20s",
    dec: "+39° 40′ 12″",
    bestSeenIn: "Summer",
    description: "Quadruple star system in Lyra",
    optimalMoonPhase: "any",
    isCurrentlyVisible: true,
  },
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
