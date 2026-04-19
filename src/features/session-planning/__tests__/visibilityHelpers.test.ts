import { describe, it, expect } from 'vitest'
import {
  altitudeColor,
  sortedCurve,
  chartXTicks,
  toChartData,
  eventLabels,
  twilightIndices,
} from '../utils/visibilityHelpers'
import type { CurvePoint, VisibilityEvents, TwilightWindow } from '../utils/visibilityHelpers'

const makePoint = (
  timeLabel: string,
  altDeg: number,
  sunAlt = -30,
  timeLocal = `2026-04-18T${timeLabel}:00-05:00`
): CurvePoint => ({
  time_local: timeLocal,
  time_label: timeLabel,
  altitude_deg: altDeg,
  azimuth_deg: 180,
  sun_altitude_deg: sunAlt,
})

const makeCurve = (): CurvePoint[] =>
  Array.from({ length: 145 }, (_, i) => {
    const totalMin = 720 + i * 10 // noon + i*10 min
    const h = Math.floor(totalMin / 60) % 24
    const m = totalMin % 60
    const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    return makePoint(label, i % 90)
  })

describe('altitudeColor', () => {
  it('above threshold → green', () => expect(altitudeColor(35, 30)).toBe('green'))
  it('at threshold → green', () => expect(altitudeColor(30, 30)).toBe('green'))
  it('within 5° below threshold → amber', () => expect(altitudeColor(26, 30)).toBe('amber'))
  it('below threshold by >5° → grey', () => expect(altitudeColor(10, 30)).toBe('grey'))
  it('exactly 5° below threshold → amber', () => expect(altitudeColor(25, 30)).toBe('amber'))
  it('just below amber boundary → grey', () => expect(altitudeColor(24.9, 30)).toBe('grey'))
})

describe('sortedCurve', () => {
  it('returns copy sorted by time_local', () => {
    const pts = [makePoint('18:00', 10), makePoint('12:00', 5), makePoint('06:00', 3)]
    const sorted = sortedCurve(pts)
    expect(sorted[0].time_label).toBe('06:00')
    expect(sorted[1].time_label).toBe('12:00')
    expect(sorted[2].time_label).toBe('18:00')
  })

  it('does not mutate the original array', () => {
    const pts = [makePoint('18:00', 10), makePoint('12:00', 5)]
    sortedCurve(pts)
    expect(pts[0].time_label).toBe('18:00')
  })
})

describe('chartXTicks', () => {
  it('returns a tick every 12 points (every 2 hours)', () => {
    const curve = makeCurve()
    const ticks = chartXTicks(curve)
    expect(ticks.length).toBe(13) // indices 0,12,24,...,144
  })

  it('first tick corresponds to first point', () => {
    const curve = makeCurve()
    expect(chartXTicks(curve)[0]).toBe(curve[0].time_label)
  })
})

describe('toChartData', () => {
  it('adds color and altDisplay fields', () => {
    const pts = [makePoint('22:00', 40)]
    const data = toChartData(pts, 30)
    expect(data[0].color).toBe('green')
    expect(data[0].altDisplay).toBe(40)
  })

  it('clamps altDisplay to 0 for negative altitudes', () => {
    const pts = [makePoint('06:00', -20)]
    const data = toChartData(pts, 30)
    expect(data[0].altDisplay).toBe(0)
  })
})

describe('eventLabels', () => {
  const events: VisibilityEvents = {
    rise_time_local: '2026-04-18T20:15:00-05:00',
    set_time_local: '2026-04-19T03:45:00-05:00',
    transit_time_local: '2026-04-19T00:00:00-05:00',
    max_altitude_deg: 65.3,
  }

  it('extracts HH:MM labels', () => {
    const labels = eventLabels(events)
    expect(labels.rise).toMatch(/^\d{2}:\d{2}$/)
    expect(labels.set).toMatch(/^\d{2}:\d{2}$/)
    expect(labels.transit).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns null for null event times', () => {
    const ev: VisibilityEvents = {
      rise_time_local: null,
      set_time_local: null,
      transit_time_local: null,
      max_altitude_deg: null,
    }
    const labels = eventLabels(ev)
    expect(labels.rise).toBeNull()
    expect(labels.set).toBeNull()
    expect(labels.transit).toBeNull()
  })
})

describe('twilightIndices', () => {
  it('finds matching indices in the curve', () => {
    const curve = makeCurve()
    // Use the time_local of a known point
    const tw: TwilightWindow = {
      astro_dark_start: curve[10].time_local,
      astro_dark_end: curve[100].time_local,
    }
    const { darkStart, darkEnd } = twilightIndices(curve, tw)
    expect(darkStart).toBe(10)
    expect(darkEnd).toBe(100)
  })

  it('returns null when twilight was not found', () => {
    const curve = makeCurve()
    const tw: TwilightWindow = { astro_dark_start: null, astro_dark_end: null }
    const { darkStart, darkEnd } = twilightIndices(curve, tw)
    expect(darkStart).toBeNull()
    expect(darkEnd).toBeNull()
  })
})
