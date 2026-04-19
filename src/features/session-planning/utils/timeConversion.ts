export type WindowTarget = { startMin: number; durationMin: number }

/** "22:30" → 1350 (minutes after local midnight) */
export function wallClockToStartMin(time: string): number {
  const parts = time.split(':')
  const h = parseInt(parts[0] ?? '0', 10)
  const m = parseInt(parts[1] ?? '0', 10)
  if (isNaN(h) || isNaN(m)) return 0
  return Math.max(0, Math.min(1440, h * 60 + m))
}

/** 1350 → "22:30" */
export function startMinToWallClock(startMin: number): string {
  const clamped = Math.max(0, Math.min(1440, startMin))
  const h = Math.floor(clamped / 60) % 24
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function isValidStartMin(startMin: number): boolean {
  return Number.isFinite(startMin) && startMin >= 0 && startMin <= 1440
}

/**
 * Returns true if [a.startMin, a.startMin+a.durationMin) overlaps
 * [b.startMin, b.startMin+b.durationMin).
 * Adjacent windows (touching) are NOT considered overlapping.
 */
export function targetsOverlap(a: WindowTarget, b: WindowTarget): boolean {
  return a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin
}
