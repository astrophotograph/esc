// J2000 to JNow coordinate conversion with precession and nutation
// Based on algorithms from "Astronomical Algorithms" by Jean Meeus

import { getJulianDay, getCenturiesSinceJ2000 } from './astronomical-calculations'

interface EquatorialCoordinates {
  ra: number   // Right Ascension in degrees
  dec: number  // Declination in degrees
}

interface ProperMotion {
  pmRA: number   // Proper motion in RA (mas/year) - milliarcseconds per year
  pmDec: number  // Proper motion in Dec (mas/year)
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

// Calculate precession matrix elements using IAU 2000 model
function getPrecessionAngles(T: number): { zeta: number; z: number; theta: number } {
  // T is centuries since J2000.0
  // These are the IAU 2000 precession angles in arcseconds
  const T2 = T * T
  const T3 = T2 * T
  
  // Convert from arcseconds to radians
  const arcsec2rad = Math.PI / (180 * 3600)
  
  const zeta = (2306.2181 * T + 0.30188 * T2 + 0.017998 * T3) * arcsec2rad
  const z = (2306.2181 * T + 1.09468 * T2 + 0.018203 * T3) * arcsec2rad
  const theta = (2004.3109 * T - 0.42665 * T2 - 0.041833 * T3) * arcsec2rad
  
  return { zeta, z, theta }
}

// Apply precession from J2000 to current epoch
export function applyPrecession(coords: EquatorialCoordinates, date: Date = new Date()): EquatorialCoordinates {
  const jd = getJulianDay(date)
  const T = getCenturiesSinceJ2000(jd)
  
  // If we're very close to J2000, skip precession
  if (Math.abs(T) < 0.0001) {
    return coords
  }
  
  const { zeta, z, theta } = getPrecessionAngles(T)
  
  // Convert coordinates to radians
  const ra0 = deg2rad(coords.ra)
  const dec0 = deg2rad(coords.dec)
  
  // Calculate intermediate values
  const cosRa0 = Math.cos(ra0)
  const sinRa0 = Math.sin(ra0)
  const cosDec0 = Math.cos(dec0)
  const sinDec0 = Math.sin(dec0)
  const cosZeta = Math.cos(zeta)
  const sinZeta = Math.sin(zeta)
  const cosZ = Math.cos(z)
  const sinZ = Math.sin(z)
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)
  
  // Apply precession using full rotation matrix
  // Convert to rectangular coordinates
  const x = cosDec0 * cosRa0
  const y = cosDec0 * sinRa0
  const z_coord = sinDec0

  // Precession matrix elements
  const xx = cosZeta * cosZ * cosTheta - sinZeta * sinZ
  const xy = -sinZeta * cosZ * cosTheta - cosZeta * sinZ
  const xz = -sinTheta * cosZ
  const yx = cosZeta * sinZ * cosTheta + sinZeta * cosZ
  const yy = -sinZeta * sinZ * cosTheta + cosZeta * cosZ
  const yz = -sinTheta * sinZ
  const zx = cosZeta * sinTheta
  const zy = -sinZeta * sinTheta
  const zz = cosTheta

  // Apply rotation matrix
  const xNew = xx * x + xy * y + xz * z_coord
  const yNew = yx * x + yy * y + yz * z_coord
  const zNew = zx * x + zy * y + zz * z_coord

  // Convert back to spherical coordinates
  const raNew = Math.atan2(yNew, xNew)
  const decNew = Math.asin(zNew)
  
  return {
    ra: normalizeAngle(rad2deg(raNew)),
    dec: rad2deg(decNew)
  }
}

// Calculate nutation corrections
export function getNutation(date: Date = new Date()): { deltaPsi: number; deltaEpsilon: number } {
  const jd = getJulianDay(date)
  const T = getCenturiesSinceJ2000(jd)
  
  // Mean elongation of the Moon from the Sun
  const D = deg2rad(normalizeAngle(297.85036 + 445267.111480 * T - 0.0019142 * T * T + T * T * T / 189474))
  
  // Mean anomaly of the Sun
  const M = deg2rad(normalizeAngle(357.52772 + 35999.050340 * T - 0.0001603 * T * T - T * T * T / 300000))
  
  // Mean anomaly of the Moon
  const Mprime = deg2rad(normalizeAngle(134.96298 + 477198.867398 * T + 0.0086972 * T * T + T * T * T / 56250))
  
  // Moon's argument of latitude
  const F = deg2rad(normalizeAngle(93.27191 + 483202.017538 * T - 0.0036825 * T * T + T * T * T / 327270))
  
  // Longitude of ascending node of Moon's orbit
  const Omega = deg2rad(normalizeAngle(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000))
  
  // Nutation in longitude (deltaPsi) - simplified series
  const deltaPsi = (-17.20 * Math.sin(Omega) - 1.32 * Math.sin(2 * F - 2 * D + 2 * Omega) 
                    - 0.23 * Math.sin(2 * F + 2 * Omega) + 0.21 * Math.sin(2 * Omega)) / 3600
  
  // Nutation in obliquity (deltaEpsilon) - simplified series
  const deltaEpsilon = (9.20 * Math.cos(Omega) + 0.57 * Math.cos(2 * F - 2 * D + 2 * Omega)
                       + 0.10 * Math.cos(2 * F + 2 * Omega) - 0.09 * Math.cos(2 * Omega)) / 3600
  
  return { 
    deltaPsi: deltaPsi,      // in degrees
    deltaEpsilon: deltaEpsilon // in degrees
  }
}

// Apply nutation to coordinates
export function applyNutation(coords: EquatorialCoordinates, date: Date = new Date()): EquatorialCoordinates {
  const { deltaPsi, deltaEpsilon } = getNutation(date)
  const jd = getJulianDay(date)
  const T = getCenturiesSinceJ2000(jd)
  
  // Mean obliquity of the ecliptic
  const epsilon0 = 23.439291 - 0.0130042 * T - 0.00000016 * T * T + 0.000000504 * T * T * T
  
  // True obliquity
  const epsilon = epsilon0 + deltaEpsilon
  
  // Convert to radians
  const ra_rad = deg2rad(coords.ra)
  const dec_rad = deg2rad(coords.dec)
  const epsilon_rad = deg2rad(epsilon)
  const deltaPsi_rad = deg2rad(deltaPsi)
  
  // Apply nutation correction
  const deltaRa = (Math.cos(epsilon_rad) + Math.sin(epsilon_rad) * Math.sin(ra_rad) * Math.tan(dec_rad)) * deltaPsi
                  - (Math.cos(ra_rad) * Math.tan(dec_rad)) * deltaEpsilon
  
  const deltaDec = (Math.sin(epsilon_rad) * Math.cos(ra_rad)) * deltaPsi
                   + Math.sin(ra_rad) * deltaEpsilon
  
  return {
    ra: normalizeAngle(coords.ra + deltaRa),
    dec: coords.dec + deltaDec
  }
}

// Apply proper motion correction
export function applyProperMotion(
  coords: EquatorialCoordinates, 
  properMotion: ProperMotion | null,
  epochYears: number
): EquatorialCoordinates {
  if (!properMotion || (properMotion.pmRA === 0 && properMotion.pmDec === 0)) {
    return coords
  }
  
  // Convert proper motion from milliarcseconds to degrees
  const pmRaDeg = (properMotion.pmRA / 3600000) * epochYears  // mas/year to degrees
  const pmDecDeg = (properMotion.pmDec / 3600000) * epochYears // mas/year to degrees
  
  // Apply proper motion
  // Note: pmRA typically includes the cos(dec) factor already
  return {
    ra: normalizeAngle(coords.ra + pmRaDeg / Math.cos(deg2rad(coords.dec))),
    dec: coords.dec + pmDecDeg
  }
}

// Convert J2000 coordinates to JNow (current epoch)
export function j2000ToJNow(
  coords: EquatorialCoordinates,
  date: Date = new Date(),
  properMotion: ProperMotion | null = null,
  includeNutation: boolean = true
): EquatorialCoordinates {
  // Calculate years since J2000
  const j2000 = new Date('2000-01-01T12:00:00Z')
  const epochYears = (date.getTime() - j2000.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  
  // Step 1: Apply proper motion (if available)
  let currentCoords = applyProperMotion(coords, properMotion, epochYears)
  
  // Step 2: Apply precession
  currentCoords = applyPrecession(currentCoords, date)
  
  // Step 3: Apply nutation (optional, for high precision)
  if (includeNutation) {
    currentCoords = applyNutation(currentCoords, date)
  }
  
  return currentCoords
}

// Convert JNow coordinates back to J2000
export function jNowToJ2000(
  coords: EquatorialCoordinates,
  date: Date = new Date(),
  properMotion: ProperMotion | null = null,
  includeNutation: boolean = true
): EquatorialCoordinates {
  // This is the inverse transformation
  // For simplicity, we'll use an iterative approach
  
  let j2000Coords = coords
  
  // Iterate to find the J2000 coordinates that would give us the current coordinates
  for (let i = 0; i < 3; i++) {
    const predictedJNow = j2000ToJNow(j2000Coords, date, properMotion, includeNutation)
    const deltaRa = coords.ra - predictedJNow.ra
    const deltaDec = coords.dec - predictedJNow.dec
    
    j2000Coords = {
      ra: normalizeAngle(j2000Coords.ra + deltaRa),
      dec: j2000Coords.dec + deltaDec
    }
  }
  
  return j2000Coords
}

// Format coordinates for display with epoch label
export function formatCoordinatesWithEpoch(
  coords: EquatorialCoordinates,
  epoch: 'J2000' | 'JNow',
  date?: Date
): string {
  const epochLabel = epoch === 'JNow' && date 
    ? `J${date.getFullYear()}.${Math.floor((date.getMonth() + 1) / 12 * 10)}`
    : epoch
    
  return `${epochLabel}: RA ${coords.ra.toFixed(6)}°, Dec ${coords.dec.toFixed(6)}°`
}

// Calculate the angular separation between two coordinates
export function angularSeparation(coord1: EquatorialCoordinates, coord2: EquatorialCoordinates): number {
  const ra1 = deg2rad(coord1.ra)
  const dec1 = deg2rad(coord1.dec)
  const ra2 = deg2rad(coord2.ra)
  const dec2 = deg2rad(coord2.dec)
  
  const deltaRa = ra2 - ra1
  
  // Using the haversine formula for better numerical stability
  const a = Math.sin((dec2 - dec1) / 2) ** 2 + 
            Math.cos(dec1) * Math.cos(dec2) * Math.sin(deltaRa / 2) ** 2
  
  return rad2deg(2 * Math.asin(Math.sqrt(a)))
}