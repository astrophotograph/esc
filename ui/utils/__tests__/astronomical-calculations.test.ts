// Tests for real-time astronomical calculations
import { 
  getJulianDay, 
  getCenturiesSinceJ2000, 
  calculateSunPosition, 
  calculateMoonPosition,
  calculatePlanetPosition,
  getRealTimeCelestialObject,
  formatCoordinates
} from '../astronomical-calculations'

describe('Astronomical Calculations', () => {
  const testDate = new Date('2024-01-01T12:00:00Z') // Fixed date for consistent tests

  describe('Julian Day calculations', () => {
    test('calculates Julian Day correctly', () => {
      const jd = getJulianDay(testDate)
      expect(jd).toBeCloseTo(2460311.5, 1) // Expected JD for Jan 1, 2024 12:00 UTC
    })

    test('calculates centuries since J2000', () => {
      const jd = getJulianDay(testDate)
      const T = getCenturiesSinceJ2000(jd)
      expect(T).toBeCloseTo(0.24, 2) // About 24 years / 100
    })
  })

  describe('Sun position calculations', () => {
    test('calculates Sun position', () => {
      const sunPos = calculateSunPosition(testDate)
      
      expect(sunPos.ra).toBeGreaterThanOrEqual(0)
      expect(sunPos.ra).toBeLessThan(360)
      expect(sunPos.dec).toBeGreaterThanOrEqual(-23.5)
      expect(sunPos.dec).toBeLessThanOrEqual(23.5)
      expect(sunPos.distance).toBeCloseTo(1.0, 1)
    })
  })

  describe('Moon position calculations', () => {
    test('calculates Moon position and phase', () => {
      const moonPos = calculateMoonPosition(testDate)
      
      expect(moonPos.ra).toBeGreaterThanOrEqual(0)
      expect(moonPos.ra).toBeLessThan(360)
      expect(moonPos.dec).toBeGreaterThanOrEqual(-30)
      expect(moonPos.dec).toBeLessThanOrEqual(30)
      expect(moonPos.phase).toBeGreaterThanOrEqual(0)
      expect(moonPos.phase).toBeLessThanOrEqual(1)
      expect(moonPos.illumination).toBeGreaterThanOrEqual(0)
      expect(moonPos.illumination).toBeLessThanOrEqual(1)
      expect(moonPos.age).toBeGreaterThanOrEqual(0)
      expect(moonPos.age).toBeLessThan(30)
    })
  })

  describe('Planet position calculations', () => {
    test('calculates Mars position', () => {
      const marsPos = calculatePlanetPosition('mars', testDate)
      
      expect(marsPos.ra).toBeGreaterThanOrEqual(0)
      expect(marsPos.ra).toBeLessThan(360)
      expect(marsPos.dec).toBeGreaterThanOrEqual(-30)
      expect(marsPos.dec).toBeLessThanOrEqual(30)
      expect(marsPos.distance).toBeGreaterThan(0)
    })

    test('throws error for unknown planet', () => {
      expect(() => {
        calculatePlanetPosition('pluto', testDate)
      }).toThrow('Unknown planet: pluto')
    })
  })

  describe('Real-time celestial objects', () => {
    test('gets real-time Sun data', () => {
      const sunObj = getRealTimeCelestialObject('sun', testDate)
      
      expect(sunObj).toBeTruthy()
      expect(sunObj?.name).toBe('Sun')
      expect(sunObj?.type).toBe('planet')
      expect(sunObj?.magnitude).toBe(-26.7)
      expect(sunObj?.ra).toMatch(/^\d{2}h \d{2}m \d{2}s$/)
      expect(sunObj?.dec).toMatch(/^[+-]\d{2}° \d{2}′ \d{2}″$/)
    })

    test('gets real-time Moon data with phase info', () => {
      const moonObj = getRealTimeCelestialObject('moon', testDate)
      
      expect(moonObj).toBeTruthy()
      expect(moonObj?.name).toBe('Moon')
      expect(moonObj?.type).toBe('moon')
      expect(moonObj?._realTimeData?.moonData).toBeTruthy()
      expect(moonObj?._realTimeData?.moonData?.phase).toBeGreaterThanOrEqual(0)
      expect(moonObj?._realTimeData?.moonData?.phase).toBeLessThanOrEqual(1)
    })

    test('gets real-time planet data', () => {
      const jupiterObj = getRealTimeCelestialObject('jupiter', testDate)
      
      expect(jupiterObj).toBeTruthy()
      expect(jupiterObj?.name).toBe('Jupiter')
      expect(jupiterObj?.type).toBe('planet')
      expect(typeof jupiterObj?.magnitude).toBe('number')
    })

    test('returns null for unknown object', () => {
      const unknown = getRealTimeCelestialObject('unknown', testDate)
      expect(unknown).toBeNull()
    })
  })

  describe('Coordinate formatting', () => {
    test('formats coordinates correctly', () => {
      const coords = { ra: 123.456, dec: -45.678 }
      const formatted = formatCoordinates(coords)
      
      expect(formatted.ra).toMatch(/^\d{2}h \d{2}m \d{2}s$/)
      expect(formatted.dec).toMatch(/^-\d{2}° \d{2}′ \d{2}″$/)
    })

    test('handles positive declination', () => {
      const coords = { ra: 0, dec: 45.123 }
      const formatted = formatCoordinates(coords)
      
      expect(formatted.dec).toMatch(/^\+\d{2}° \d{2}′ \d{2}″$/)
    })
  })
})