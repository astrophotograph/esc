// Shared celestial-coordinate formatting helpers.
//
// Previously these conversions were copy-pasted into CatalogSearch,
// GotoProgressOverlay, PlateSolveDialog and TelescopeControlsOverlay. Keeping a
// single implementation avoids drift and gives us one place to unit-test the math.

/**
 * Format a right ascension given in **degrees** as an `Hh Mm Ss.s` string.
 * RA is stored in degrees (0–360); display divides by 15 to get hours.
 */
export function formatRA(raDegrees: number): string {
  if (!Number.isFinite(raDegrees)) return '—'
  const raHours = raDegrees / 15
  const hours = Math.floor(raHours)
  const minutesDecimal = (raHours - hours) * 60
  const minutes = Math.floor(minutesDecimal)
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(1)
  return `${hours}h ${minutes}m ${seconds}s`
}

/**
 * Format a declination given in **degrees** as a signed `±Dd° Mm' Ss.s"` string.
 */
export function formatDec(decDegrees: number): string {
  if (!Number.isFinite(decDegrees)) return '—'
  const sign = decDegrees < 0 ? '-' : '+'
  const absDec = Math.abs(decDegrees)
  const degrees = Math.floor(absDec)
  const minutesDecimal = (absDec - degrees) * 60
  const minutes = Math.floor(minutesDecimal)
  const seconds = ((minutesDecimal - minutes) * 60).toFixed(1)
  return `${sign}${degrees}° ${minutes}' ${seconds}"`
}

/**
 * Unified formatter for overlays/dialogs that may not have a value yet.
 * Returns `placeholder` for undefined/null/non-finite input instead of throwing
 * or rendering `NaN`. Precision is standardized via {@link formatRA}/{@link formatDec}.
 */
export function formatCoordinate(
  value: number | undefined | null,
  type: 'ra' | 'dec',
  placeholder = '---',
): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return placeholder
  return type === 'ra' ? formatRA(value) : formatDec(value)
}

// Backwards-compatible aliases for the call sites that used these names.
export const raToHMS = formatRA
export const decToDMS = formatDec
