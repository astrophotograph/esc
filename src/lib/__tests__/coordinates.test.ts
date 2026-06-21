import { describe, it, expect } from 'vitest'
import { formatRA, formatDec, formatCoordinate, raToHMS, decToDMS } from '../coordinates'

describe('formatRA', () => {
  it('formats 0 degrees as 0h', () => {
    expect(formatRA(0)).toBe('0h 0m 0.0s')
  })

  it('converts degrees to hours (15 deg = 1 hour)', () => {
    expect(formatRA(15)).toBe('1h 0m 0.0s')
    expect(formatRA(180)).toBe('12h 0m 0.0s')
  })

  it('formats minutes and seconds', () => {
    // 10 deg = 0.6667h -> 0h 40m 0.0s
    expect(formatRA(10)).toBe('0h 40m 0.0s')
  })

  it('returns a placeholder for non-finite input', () => {
    expect(formatRA(NaN)).toBe('—')
    expect(formatRA(Infinity)).toBe('—')
  })
})

describe('formatDec', () => {
  it('formats positive declination with a + sign', () => {
    expect(formatDec(0)).toBe('+0° 0\' 0.0"')
    expect(formatDec(45.5)).toBe('+45° 30\' 0.0"')
  })

  it('formats negative declination with a - sign', () => {
    expect(formatDec(-45.5)).toBe('-45° 30\' 0.0"')
  })

  it('returns a placeholder for non-finite input', () => {
    expect(formatDec(NaN)).toBe('—')
  })
})

describe('formatCoordinate', () => {
  it('returns the default placeholder for undefined/null/NaN', () => {
    expect(formatCoordinate(undefined, 'ra')).toBe('---')
    expect(formatCoordinate(null, 'dec')).toBe('---')
    expect(formatCoordinate(NaN, 'ra')).toBe('---')
  })

  it('accepts a custom placeholder', () => {
    expect(formatCoordinate(undefined, 'ra', '—')).toBe('—')
  })

  it('delegates to formatRA / formatDec for finite values', () => {
    expect(formatCoordinate(15, 'ra')).toBe('1h 0m 0.0s')
    expect(formatCoordinate(-45.5, 'dec')).toBe('-45° 30\' 0.0"')
  })
})

describe('aliases', () => {
  it('raToHMS and decToDMS map to formatRA/formatDec', () => {
    expect(raToHMS).toBe(formatRA)
    expect(decToDMS).toBe(formatDec)
    expect(raToHMS(15)).toBe('1h 0m 0.0s')
  })
})
