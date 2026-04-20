import { describe, it, expect } from 'vitest'
import {
  wallClockToStartMin,
  startMinToWallClock,
  isValidStartMin,
  targetsOverlap,
} from '../utils/timeConversion'

describe('wallClockToStartMin', () => {
  it('midnight is zero', () => expect(wallClockToStartMin('00:00')).toBe(0))
  it('noon is 720', () => expect(wallClockToStartMin('12:00')).toBe(720))
  it('22:30 is 1350', () => expect(wallClockToStartMin('22:30')).toBe(1350))
  it('02:30 is 150', () => expect(wallClockToStartMin('02:30')).toBe(150))
  it('invalid string returns 0', () => expect(wallClockToStartMin('bad')).toBe(0))
  it('clamps over-range values', () => expect(wallClockToStartMin('25:00')).toBe(1440))
})

describe('startMinToWallClock', () => {
  it('0 → 00:00', () => expect(startMinToWallClock(0)).toBe('00:00'))
  it('720 → 12:00', () => expect(startMinToWallClock(720)).toBe('12:00'))
  it('1350 → 22:30', () => expect(startMinToWallClock(1350)).toBe('22:30'))
  it('150 → 02:30', () => expect(startMinToWallClock(150)).toBe('02:30'))
  it('pads single-digit minutes', () => expect(startMinToWallClock(61)).toBe('01:01'))
})

describe('roundtrip', () => {
  it('21:45 roundtrips correctly', () =>
    expect(startMinToWallClock(wallClockToStartMin('21:45'))).toBe('21:45'))
  it('00:05 roundtrips correctly', () =>
    expect(startMinToWallClock(wallClockToStartMin('00:05'))).toBe('00:05'))
})

describe('isValidStartMin', () => {
  it('0 is valid', () => expect(isValidStartMin(0)).toBe(true))
  it('1440 is valid', () => expect(isValidStartMin(1440)).toBe(true))
  it('720 is valid', () => expect(isValidStartMin(720)).toBe(true))
  it('-1 is invalid', () => expect(isValidStartMin(-1)).toBe(false))
  it('1441 is invalid', () => expect(isValidStartMin(1441)).toBe(false))
  it('NaN is invalid', () => expect(isValidStartMin(NaN)).toBe(false))
  it('Infinity is invalid', () => expect(isValidStartMin(Infinity)).toBe(false))
})

describe('targetsOverlap', () => {
  it('non-overlapping returns false', () =>
    expect(targetsOverlap({ startMin: 60, durationMin: 60 }, { startMin: 120, durationMin: 60 })).toBe(false))

  it('overlapping returns true', () =>
    expect(targetsOverlap({ startMin: 60, durationMin: 60 }, { startMin: 90, durationMin: 60 })).toBe(true))

  it('adjacent windows do not overlap', () =>
    expect(targetsOverlap({ startMin: 60, durationMin: 60 }, { startMin: 120, durationMin: 60 })).toBe(false))

  it('contained window overlaps', () =>
    expect(targetsOverlap({ startMin: 60, durationMin: 120 }, { startMin: 80, durationMin: 20 })).toBe(true))

  it('identical windows overlap', () =>
    expect(targetsOverlap({ startMin: 60, durationMin: 60 }, { startMin: 60, durationMin: 60 })).toBe(true))

  it('b before a, overlap', () =>
    expect(targetsOverlap({ startMin: 90, durationMin: 60 }, { startMin: 60, durationMin: 60 })).toBe(true))

  it('b before a, no overlap', () =>
    expect(targetsOverlap({ startMin: 120, durationMin: 60 }, { startMin: 60, durationMin: 60 })).toBe(false))
})
