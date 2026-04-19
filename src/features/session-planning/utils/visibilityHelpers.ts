export interface CurvePoint {
  time_local: string    // ISO datetime string
  time_label: string    // "HH:MM"
  altitude_deg: number
  azimuth_deg: number
  sun_altitude_deg: number
}

export interface VisibilityEvents {
  rise_time_local: string | null
  set_time_local: string | null
  transit_time_local: string | null
  max_altitude_deg: number | null
}

export interface TwilightWindow {
  astro_dark_start: string | null
  astro_dark_end: string | null
}

export interface VisibilityCurveData {
  curve: CurvePoint[]
  events: VisibilityEvents
  twilight: TwilightWindow
}

export type AltitudeColor = 'green' | 'amber' | 'grey'

export function altitudeColor(altDeg: number, minAltDeg: number): AltitudeColor {
  if (altDeg >= minAltDeg) return 'green'
  if (altDeg >= minAltDeg - 5) return 'amber'
  return 'grey'
}

/** Sort curve points by time_local (they should already be sorted). */
export function sortedCurve(points: CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a.time_local.localeCompare(b.time_local))
}

/** X-axis tick labels every 2 hours (every 12 points at 10-min intervals). */
export function chartXTicks(points: CurvePoint[]): string[] {
  return points.filter((_, i) => i % 12 === 0).map((p) => p.time_label)
}

export interface ChartDataPoint extends CurvePoint {
  color: AltitudeColor
  altDisplay: number // altitude clamped to 0 for area chart
}

/** Convert curve to recharts-compatible data with color field. */
export function toChartData(points: CurvePoint[], minAltDeg: number): ChartDataPoint[] {
  return points.map((p) => ({
    ...p,
    color: altitudeColor(p.altitude_deg, minAltDeg),
    altDisplay: Math.max(0, p.altitude_deg),
  }))
}

/** Extract HH:MM labels for rise/transit/set from events. */
export function eventLabels(events: VisibilityEvents): {
  rise: string | null
  transit: string | null
  set: string | null
} {
  const toLabel = (iso: string | null): string | null => {
    if (!iso) return null
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return null
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch {
      return null
    }
  }
  return {
    rise: toLabel(events.rise_time_local),
    transit: toLabel(events.transit_time_local),
    set: toLabel(events.set_time_local),
  }
}

/**
 * Find array indices where astronomical darkness starts and ends.
 * Matches by HH:MM prefix of the ISO timestamp.
 */
export function twilightIndices(
  points: CurvePoint[],
  twilight: TwilightWindow
): { darkStart: number | null; darkEnd: number | null } {
  const find = (iso: string | null): number | null => {
    if (!iso) return null
    const target = iso.slice(0, 16) // "YYYY-MM-DDTHH:MM"
    const idx = points.findIndex((p) => p.time_local.startsWith(target))
    return idx >= 0 ? idx : null
  }
  return {
    darkStart: find(twilight.astro_dark_start),
    darkEnd: find(twilight.astro_dark_end),
  }
}
