// Real-time astronomical calculations for Sun, Moon, and planets
// Based on simplified versions of algorithms from "Astronomical Algorithms" by Jean Meeus

interface CelestialCoordinates {
  ra: number    // Right Ascension in degrees
  dec: number   // Declination in degrees
  distance?: number // Distance in AU (for planets) or Earth radii (for Moon)
}

interface MoonData extends CelestialCoordinates {
  phase: number      // 0-1 (0 = new moon, 0.5 = full moon)
  illumination: number // 0-1 (fraction illuminated)
  age: number        // days since new moon
}

// Convert degrees to radians
const deg2rad = (deg: number): number => deg * Math.PI / 180
// Convert radians to degrees  
const rad2deg = (rad: number): number => rad * 180 / Math.PI

// Normalize angle to 0-360 degrees
const normalizeAngle = (angle: number): number => {
  angle = angle % 360
  return angle < 0 ? angle + 360 : angle
}

// Calculate Julian Day Number
export function getJulianDay(date: Date = new Date()): number {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate() + 
    date.getUTCHours() / 24 + 
    date.getUTCMinutes() / 1440 + 
    date.getUTCSeconds() / 86400

  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3

  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
}

// Calculate centuries since J2000.0
export function getCenturiesSinceJ2000(jd: number): number {
  return (jd - 2451545.0) / 36525.0
}

// Calculate the Sun's position (simplified algorithm)
export function calculateSunPosition(date: Date = new Date()): CelestialCoordinates {
  const jd = getJulianDay(date)
  const T = getCenturiesSinceJ2000(jd)
  
  // Mean longitude of the Sun (degrees)
  const L0 = normalizeAngle(280.46646 + 36000.76983 * T + 0.0003032 * T * T)
  
  // Mean anomaly of the Sun (degrees)
  const M = normalizeAngle(357.52911 + 35999.05029 * T - 0.0001537 * T * T)
  const M_rad = deg2rad(M)
  
  // Equation of center
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M_rad) +
            (0.019993 - 0.000101 * T) * Math.sin(2 * M_rad) +
            0.000289 * Math.sin(3 * M_rad)
  
  // True longitude
  const L = L0 + C
  
  // Apparent longitude (corrected for nutation and aberration)
  const omega = normalizeAngle(125.04 - 1934.136 * T)
  const lambda = L - 0.00569 - 0.00478 * Math.sin(deg2rad(omega))
  
  // Obliquity of the ecliptic
  const epsilon = 23.439291 - 0.0130042 * T - 0.00000164 * T * T + 0.000000504 * T * T * T
  const epsilon_rad = deg2rad(epsilon)
  const lambda_rad = deg2rad(lambda)
  
  // Convert to right ascension and declination
  const ra = rad2deg(Math.atan2(Math.cos(epsilon_rad) * Math.sin(lambda_rad), Math.cos(lambda_rad)))
  const dec = rad2deg(Math.asin(Math.sin(epsilon_rad) * Math.sin(lambda_rad)))
  
  return {
    ra: normalizeAngle(ra),
    dec: dec,
    distance: 1.0 // Sun is always 1 AU away by definition
  }
}

// Calculate the Moon's position and phase
export function calculateMoonPosition(date: Date = new Date()): MoonData {
  const jd = getJulianDay(date)
  const T = getCenturiesSinceJ2000(jd)
  
  // Mean longitude of the Moon
  const L = normalizeAngle(218.3164591 + 481267.88134236 * T - 0.0013268 * T * T + T * T * T / 538841 - T * T * T * T / 65194000)
  
  // Mean anomaly of the Moon
  const M = normalizeAngle(134.9634114 + 477198.8676313 * T + 0.008997 * T * T + T * T * T / 69699 - T * T * T * T / 14712000)
  
  // Mean anomaly of the Sun
  const M_sun = normalizeAngle(357.5291 + 35999.0503 * T)
  
  // Mean distance of Moon from ascending node
  const F = normalizeAngle(93.2720993 + 483202.0175273 * T - 0.0034029 * T * T - T * T * T / 3526000 + T * T * T * T / 863310000)
  
  // Mean elongation of Moon from Sun
  const D = normalizeAngle(297.8502042 + 445267.1115168 * T - 0.0016300 * T * T + T * T * T / 545868 - T * T * T * T / 113065000)
  
  // Convert to radians for calculations
  const L_rad = deg2rad(L)
  const M_rad = deg2rad(M)
  const M_sun_rad = deg2rad(M_sun)
  const F_rad = deg2rad(F)
  const D_rad = deg2rad(D)
  
  // Simplified lunar longitude correction (major terms only)
  const longitude_correction = 
    6.289 * Math.sin(M_rad) +
    1.274 * Math.sin(2 * D_rad - M_rad) +
    0.658 * Math.sin(2 * D_rad) +
    0.214 * Math.sin(2 * M_rad) +
    -0.186 * Math.sin(M_sun_rad) +
    -0.059 * Math.sin(2 * D_rad - 2 * M_rad) +
    -0.057 * Math.sin(2 * D_rad - M_sun_rad - M_rad) +
    0.053 * Math.sin(2 * D_rad + M_rad) +
    0.046 * Math.sin(2 * D_rad - M_sun_rad) +
    0.041 * Math.sin(M_rad - M_sun_rad)
  
  // Simplified lunar latitude correction (major terms only)
  const latitude_correction =
    5.128 * Math.sin(F_rad) +
    0.281 * Math.sin(M_rad + F_rad) +
    0.277 * Math.sin(M_rad - F_rad) +
    0.173 * Math.sin(2 * D_rad - F_rad) +
    0.055 * Math.sin(2 * D_rad - M_rad + F_rad) +
    -0.046 * Math.sin(2 * D_rad - M_rad - F_rad) +
    -0.040 * Math.sin(3 * M_rad + F_rad) +
    -0.034 * Math.sin(2 * M_rad - F_rad) +
    -0.032 * Math.sin(M_rad + 2 * D_rad - F_rad)
  
  // True longitude and latitude
  const true_longitude = L + longitude_correction
  const true_latitude = latitude_correction
  
  // Convert to equatorial coordinates
  const epsilon = 23.439291 - 0.0130042 * T // Obliquity of ecliptic
  const epsilon_rad = deg2rad(epsilon)
  const lambda_rad = deg2rad(true_longitude)
  const beta_rad = deg2rad(true_latitude)
  
  const ra = rad2deg(Math.atan2(
    Math.sin(lambda_rad) * Math.cos(epsilon_rad) - Math.tan(beta_rad) * Math.sin(epsilon_rad),
    Math.cos(lambda_rad)
  ))
  
  const dec = rad2deg(Math.asin(
    Math.sin(beta_rad) * Math.cos(epsilon_rad) + Math.cos(beta_rad) * Math.sin(epsilon_rad) * Math.sin(lambda_rad)
  ))
  
  // Calculate phase
  const sun_pos = calculateSunPosition(date)
  const elongation = normalizeAngle(true_longitude - sun_pos.ra)
  const phase = (1 - Math.cos(deg2rad(elongation))) / 2
  
  // Calculate age (approximate)
  const synodic_month = 29.53058867 // days
  const new_moon_jd = 2451549.953 // JD of a known new moon (Jan 6, 2000)
  const cycles = (jd - new_moon_jd) / synodic_month
  const age = (cycles - Math.floor(cycles)) * synodic_month
  
  return {
    ra: normalizeAngle(ra),
    dec: dec,
    distance: 60.4, // Average distance in Earth radii
    phase: phase,
    illumination: phase,
    age: age
  }
}

// Simplified planetary positions (using mean orbital elements)
export function calculatePlanetPosition(planet: string, date: Date = new Date()): CelestialCoordinates {
  const jd = getJulianDay(date)
  const T = getCenturiesSinceJ2000(jd)
  
  // Orbital elements (simplified, for demonstration)
  const planetData: { [key: string]: any } = {
    mercury: {
      a: 0.38709927,      // Semi-major axis (AU)
      e: 0.20563593,      // Eccentricity
      i: 7.00497902,      // Inclination (degrees)
      L: 252.25032350,    // Mean longitude (degrees)
      long_peri: 77.45779628, // Longitude of perihelion
      long_node: 48.33076593  // Longitude of ascending node
    },
    venus: {
      a: 0.72333566,
      e: 0.00677672,
      i: 3.39467605,
      L: 181.97909950,
      long_peri: 131.60246718,
      long_node: 76.67984255
    },
    mars: {
      a: 1.52371034,
      e: 0.09339410,
      i: 1.84969142,
      L: 355.43299958,
      long_peri: 336.06023395,
      long_node: 49.55953891
    },
    jupiter: {
      a: 5.20288700,
      e: 0.04838624,
      i: 1.30439695,
      L: 34.39644051,
      long_peri: 14.72847983,
      long_node: 100.47390909
    },
    saturn: {
      a: 9.53667594,
      e: 0.05386179,
      i: 2.48599187,
      L: 49.95424423,
      long_peri: 92.59887831,
      long_node: 113.66242448
    }
  }
  
  const p = planetData[planet.toLowerCase()]
  if (!p) {
    throw new Error(`Unknown planet: ${planet}`)
  }
  
  // Calculate mean anomaly
  const n = 0.9856076686 / Math.sqrt(p.a * p.a * p.a) // Mean motion (degrees/day)
  const M = normalizeAngle(p.L + n * (jd - 2451545.0) - p.long_peri)
  const M_rad = deg2rad(M)
  
  // Solve Kepler's equation (simplified)
  let E = M_rad
  for (let i = 0; i < 5; i++) {
    E = M_rad + p.e * Math.sin(E)
  }
  
  // True anomaly
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + p.e) * Math.sin(E / 2),
    Math.sqrt(1 - p.e) * Math.cos(E / 2)
  )
  
  // Distance
  const r = p.a * (1 - p.e * Math.cos(E))
  
  // Heliocentric coordinates
  const x = r * Math.cos(nu + deg2rad(p.long_peri - p.long_node))
  const y = r * Math.sin(nu + deg2rad(p.long_peri - p.long_node))
  
  // Convert to geocentric coordinates (simplified - ignoring Earth's position for now)
  // In a full implementation, you'd subtract Earth's position
  
  // Convert to equatorial coordinates (simplified)
  const epsilon = 23.439291 - 0.0130042 * T
  const epsilon_rad = deg2rad(epsilon)
  
  const ra = rad2deg(Math.atan2(y, x))
  const dec = rad2deg(Math.asin(0)) // Simplified - planets are near ecliptic
  
  return {
    ra: normalizeAngle(ra),
    dec: dec,
    distance: r
  }
}

// Format coordinates to HMS/DMS format
export function formatCoordinates(coords: CelestialCoordinates): { ra: string, dec: string } {
  // Convert RA to hours, minutes, seconds
  const raHours = coords.ra / 15
  const raH = Math.floor(raHours)
  const raM = Math.floor((raHours - raH) * 60)
  const raS = Math.round(((raHours - raH) * 60 - raM) * 60)
  
  // Convert Dec to degrees, arcminutes, arcseconds
  const decSign = coords.dec >= 0 ? '+' : '-'
  const decAbs = Math.abs(coords.dec)
  const decD = Math.floor(decAbs)
  const decM = Math.floor((decAbs - decD) * 60)
  const decS = Math.round(((decAbs - decD) * 60 - decM) * 60)
  
  return {
    ra: `${raH.toString().padStart(2, '0')}h ${raM.toString().padStart(2, '0')}m ${raS.toString().padStart(2, '0')}s`,
    dec: `${decSign}${decD.toString().padStart(2, '0')}° ${decM.toString().padStart(2, '0')}′ ${decS.toString().padStart(2, '0')}″`
  }
}

// Get current magnitude for planets (simplified)
export function getPlanetMagnitude(planet: string, distance: number): number {
  const baseMagnitudes: { [key: string]: number } = {
    mercury: -0.4,
    venus: -4.6,
    mars: -1.8,
    jupiter: -2.7,
    saturn: 0.7
  }
  
  const base = baseMagnitudes[planet.toLowerCase()]
  if (base === undefined) return 0
  
  // Simplified magnitude calculation based on distance
  // Real calculations would include phase effects, ring system for Saturn, etc.
  return base + 5 * Math.log10(distance)
}

// Main function to get real-time celestial object data
export function getRealTimeCelestialObject(objectId: string, date: Date = new Date()) {
  const baseObjects: { [key: string]: any } = {
    sun: {
      id: "sun",
      name: "Sun",
      type: "planet",
      description: "Our star - WARNING: Never observe directly without proper solar filters",
      optimalMoonPhase: "any",
      bestSeenIn: "Daytime"
    },
    moon: {
      id: "moon", 
      name: "Moon",
      type: "moon",
      description: "Earth's natural satellite",
      optimalMoonPhase: "any",
      bestSeenIn: "Night"
    },
    mercury: {
      id: "mercury",
      name: "Mercury", 
      type: "planet",
      description: "Innermost planet of the solar system",
      optimalMoonPhase: "any",
      bestSeenIn: "Evening twilight"
    },
    venus: {
      id: "venus",
      name: "Venus",
      type: "planet", 
      description: "Brightest object in the night sky after Moon",
      optimalMoonPhase: "any",
      bestSeenIn: "Evening"
    },
    mars: {
      id: "mars",
      name: "Mars",
      type: "planet",
      description: "The Red Planet", 
      optimalMoonPhase: "any",
      bestSeenIn: "Evening"
    },
    jupiter: {
      id: "jupiter",
      name: "Jupiter",
      type: "planet",
      description: "Largest planet in our solar system",
      optimalMoonPhase: "any", 
      bestSeenIn: "Evening"
    },
    saturn: {
      id: "saturn",
      name: "Saturn",
      type: "planet",
      description: "Ringed planet with beautiful ring system",
      optimalMoonPhase: "any",
      bestSeenIn: "Evening"
    }
  }
  
  const baseObj = baseObjects[objectId.toLowerCase()]
  if (!baseObj) return null
  
  let coords: CelestialCoordinates
  let magnitude: number
  let moonData: MoonData | null = null
  
  switch (objectId.toLowerCase()) {
    case 'sun':
      coords = calculateSunPosition(date)
      magnitude = -26.7
      break
    case 'moon':
      moonData = calculateMoonPosition(date)
      coords = moonData
      magnitude = -12.6 + 2.5 * Math.log10(moonData.illumination + 0.1) // Varies with phase
      break
    default:
      coords = calculatePlanetPosition(objectId, date)
      magnitude = getPlanetMagnitude(objectId, coords.distance || 1)
      break
  }
  
  const formattedCoords = formatCoordinates(coords)
  
  return {
    ...baseObj,
    ra: formattedCoords.ra,
    dec: formattedCoords.dec,
    magnitude: Math.round(magnitude * 10) / 10,
    isCurrentlyVisible: true, // Will be determined by horizon calculations
    // Additional data for dynamic objects
    _realTimeData: {
      coords: coords,
      moonData: moonData,
      lastCalculated: date
    }
  }
}