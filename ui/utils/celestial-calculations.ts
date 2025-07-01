// Celestial calculations for horizon visibility and altitude
// Integrates with real-time astronomical calculations for accurate positions

interface Coordinates {
  ra: string  // Right Ascension in format "HHh MMm SSs"
  dec: string // Declination in format "±DD° MM′ SS″"
}

interface GeographicCoordinates {
  latitude: number  // degrees
  longitude: number // degrees
}

interface HorizonInfo {
  isVisible: boolean
  altitude: number // degrees above horizon (negative if below)
  azimuth: number  // degrees from north (0-360)
}

// Convert RA/Dec string format to decimal degrees
export function parseRA(ra: string): number {
  const matches = ra.match(/(\d+)h\s*(\d+)m\s*(\d+)s/)
  if (!matches) return 0
  
  const hours = parseInt(matches[1])
  const minutes = parseInt(matches[2])
  const seconds = parseInt(matches[3])
  
  return (hours + minutes / 60 + seconds / 3600) * 15 // Convert hours to degrees
}

export function parseDec(dec: string): number {
  const matches = dec.match(/([+-]?)(\d+)°\s*(\d+)′\s*(\d+)″/)
  if (!matches) return 0
  
  const sign = matches[1] === '-' ? -1 : 1
  const degrees = parseInt(matches[2])
  const arcminutes = parseInt(matches[3])
  const arcseconds = parseInt(matches[4])
  
  return sign * (degrees + arcminutes / 60 + arcseconds / 3600)
}

// Calculate Local Sidereal Time (simplified)
function getLocalSiderealTime(longitude: number, date: Date = new Date()): number {
  // Simplified LST calculation - in reality this would be more complex
  const J2000 = new Date('2000-01-01T12:00:00Z')
  const daysSinceJ2000 = (date.getTime() - J2000.getTime()) / (1000 * 60 * 60 * 24)
  
  // Greenwich Sidereal Time at 0h UT
  const GST0 = (280.46061837 + 360.98564736629 * daysSinceJ2000) % 360
  
  // Current time contribution
  const timeContribution = (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) * 15
  
  // Local Sidereal Time
  const LST = (GST0 + timeContribution + longitude) % 360
  return LST < 0 ? LST + 360 : LST
}

// Calculate altitude and azimuth for a celestial object
export function calculateHorizonPosition(
  coordinates: Coordinates,
  observerLocation: GeographicCoordinates,
  date: Date = new Date()
): HorizonInfo {
  const ra = parseRA(coordinates.ra)
  const dec = parseDec(coordinates.dec)
  const lat = observerLocation.latitude * Math.PI / 180 // Convert to radians
  const LST = getLocalSiderealTime(observerLocation.longitude, date)
  
  // Hour Angle
  const hourAngle = (LST - ra) * Math.PI / 180
  const decRad = dec * Math.PI / 180
  
  // Calculate altitude
  const sinAlt = Math.sin(decRad) * Math.sin(lat) + 
                 Math.cos(decRad) * Math.cos(lat) * Math.cos(hourAngle)
  const altitude = Math.asin(sinAlt) * 180 / Math.PI
  
  // Calculate azimuth
  const cosAz = (Math.sin(decRad) - Math.sin(lat) * sinAlt) / 
                (Math.cos(lat) * Math.cos(Math.asin(sinAlt)))
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI
  
  // Adjust azimuth for quadrant
  if (Math.sin(hourAngle) > 0) {
    azimuth = 360 - azimuth
  }
  
  return {
    isVisible: altitude > 0, // Above horizon
    altitude: Math.round(altitude * 10) / 10, // Round to 1 decimal place
    azimuth: Math.round(azimuth * 10) / 10
  }
}

// Default observer location (can be overridden by user settings)
export const DEFAULT_OBSERVER_LOCATION: GeographicCoordinates = {
  latitude: 40.7128,  // New York City
  longitude: -74.0060
}

// Enhanced CelestialObject with horizon information
export interface CelestialObjectWithHorizon {
  id: string
  name: string
  type: string
  magnitude: number
  ra: string
  dec: string
  bestSeenIn: string
  description: string
  optimalMoonPhase: string
  isCurrentlyVisible: boolean
  // Horizon information
  altitude: number
  azimuth: number
  isAboveHorizon: boolean
}

// Calculate horizon info for all celestial objects
export function addHorizonInfo(
  objects: any[],
  observerLocation: GeographicCoordinates = DEFAULT_OBSERVER_LOCATION,
  date: Date = new Date()
): CelestialObjectWithHorizon[] {
  return objects.map(obj => {
    const horizonInfo = calculateHorizonPosition(
      { ra: obj.ra, dec: obj.dec },
      observerLocation,
      date
    )
    
    return {
      ...obj,
      altitude: horizonInfo.altitude,
      azimuth: horizonInfo.azimuth,
      isAboveHorizon: horizonInfo.isVisible
    }
  })
}

// Filter objects that are above horizon
export function filterVisibleObjects(
  objects: CelestialObjectWithHorizon[],
  minAltitude: number = 0
): CelestialObjectWithHorizon[] {
  return objects.filter(obj => obj.isAboveHorizon && obj.altitude >= minAltitude)
}

// Import real-time astronomical calculations
import { getRealTimeCelestialObject } from './astronomical-calculations'

// Get dynamic celestial objects with real-time coordinates
export function getDynamicCelestialObjects(
  staticObjects: any[],
  observerLocation: GeographicCoordinates = DEFAULT_OBSERVER_LOCATION,
  date: Date = new Date()
): CelestialObjectWithHorizon[] {
  const dynamicObjectIds = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']
  
  // Process static objects (Messier objects, double stars, etc.)
  const staticWithHorizon = addHorizonInfo(
    staticObjects.filter(obj => !dynamicObjectIds.includes(obj.id)),
    observerLocation,
    date
  )
  
  // Process dynamic objects with real-time calculations
  const dynamicWithHorizon: CelestialObjectWithHorizon[] = []
  
  for (const objId of dynamicObjectIds) {
    try {
      const realTimeObj = getRealTimeCelestialObject(objId, date)
      if (realTimeObj) {
        const horizonInfo = calculateHorizonPosition(
          { ra: realTimeObj.ra, dec: realTimeObj.dec },
          observerLocation,
          date
        )
        
        dynamicWithHorizon.push({
          ...realTimeObj,
          altitude: horizonInfo.altitude,
          azimuth: horizonInfo.azimuth,
          isAboveHorizon: horizonInfo.isVisible
        })
      }
    } catch (error) {
      console.warn(`Failed to calculate position for ${objId}:`, error)
      // Fall back to static data if available
      const staticObj = staticObjects.find(obj => obj.id === objId)
      if (staticObj) {
        const horizonInfo = calculateHorizonPosition(
          { ra: staticObj.ra, dec: staticObj.dec },
          observerLocation,
          date
        )
        
        dynamicWithHorizon.push({
          ...staticObj,
          altitude: horizonInfo.altitude,
          azimuth: horizonInfo.azimuth,
          isAboveHorizon: horizonInfo.isVisible
        })
      }
    }
  }
  
  return [...staticWithHorizon, ...dynamicWithHorizon]
}