import { describe, it, expect } from 'vitest'
import {
  scheduleToWireFormat,
  exportScheduleToJson,
  importScheduleFromJson,
} from '../utils/scheduleSerialization'
import type { Schedule } from '../../../stores/schedulerStore'

const makeSchedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  planName: 'Test Plan',
  updatedAt: '2026-04-18T00:00:00.000Z',
  targets: [
    {
      id: 1,
      targetName: 'M31',
      aliasName: 'Andromeda Galaxy',
      raDec: [10.68, 41.27],
      startMin: 180,
      durationMin: 60,
      lpFilter: true,
      mosaic: null,
    },
    {
      id: 2,
      targetName: 'M42',
      aliasName: 'Orion Nebula',
      raDec: [83.82, -5.39],
      startMin: 120,
      durationMin: 45,
      lpFilter: false,
      mosaic: { scale: 1.5, angle: 30, starMapAngle: 0, panX: 0, panY: 0, zoom: 4.0 },
    },
  ],
  ...overrides,
})

describe('scheduleToWireFormat', () => {
  it('sorts targets by start_min ascending', () => {
    const wire = scheduleToWireFormat(makeSchedule())
    expect(wire.list[0].start_min).toBe(120)
    expect(wire.list[1].start_min).toBe(180)
  })

  it('omits mosaic key when null', () => {
    const wire = scheduleToWireFormat(makeSchedule())
    const m31 = wire.list.find((t) => t.target_name === 'M31')!
    expect(m31.mosaic).toBeUndefined()
  })

  it('includes mosaic when non-trivial', () => {
    const wire = scheduleToWireFormat(makeSchedule())
    const m42 = wire.list.find((t) => t.target_name === 'M42')!
    expect(m42.mosaic).toBeDefined()
    expect(m42.mosaic!.scale).toBe(1.5)
    expect(m42.mosaic!.angle).toBe(30)
  })

  it('omits mosaic when trivial (scale=1, angle=0, starMapAngle=0)', () => {
    const s = makeSchedule({
      targets: [
        {
          id: 1,
          targetName: 'M57',
          aliasName: 'Ring Nebula',
          raDec: [283.4, 33.03],
          startMin: 60,
          durationMin: 30,
          lpFilter: false,
          mosaic: { scale: 1.0, angle: 0.0, starMapAngle: 0.0, panX: 0, panY: 0, zoom: 4.0 },
        },
      ],
    })
    const wire = scheduleToWireFormat(s)
    expect(wire.list[0].mosaic).toBeUndefined()
  })
})

describe('exportScheduleToJson', () => {
  it('includes esc_schedule_version field', () => {
    const json = exportScheduleToJson(makeSchedule())
    const obj = JSON.parse(json)
    expect(obj.esc_schedule_version).toBe(1)
  })

  it('includes exported_at field', () => {
    const json = exportScheduleToJson(makeSchedule())
    const obj = JSON.parse(json)
    expect(obj.exported_at).toBeDefined()
  })
})

describe('importScheduleFromJson', () => {
  it('roundtrip export → import → export produces identical plan_name', () => {
    const original = makeSchedule()
    const json = exportScheduleToJson(original)
    const imported = importScheduleFromJson(json)
    expect(imported.planName).toBe(original.planName)
  })

  it('roundtrip preserves target count', () => {
    const original = makeSchedule()
    const imported = importScheduleFromJson(exportScheduleToJson(original))
    expect(imported.targets.length).toBe(original.targets.length)
  })

  it('roundtrip preserves mosaic config', () => {
    const original = makeSchedule()
    const imported = importScheduleFromJson(exportScheduleToJson(original))
    const m42 = imported.targets.find((t) => t.targetName === 'M42')!
    expect(m42.mosaic).not.toBeNull()
    expect(m42.mosaic!.scale).toBe(1.5)
  })

  it('throws on invalid JSON', () => {
    expect(() => importScheduleFromJson('not json')).toThrow('Invalid JSON')
  })

  it('throws on missing plan_name', () => {
    const obj = JSON.parse(exportScheduleToJson(makeSchedule()))
    delete obj.plan.plan_name
    expect(() => importScheduleFromJson(JSON.stringify(obj))).toThrow()
  })

  it('throws on missing list', () => {
    const obj = JSON.parse(exportScheduleToJson(makeSchedule()))
    delete obj.plan.list
    expect(() => importScheduleFromJson(JSON.stringify(obj))).toThrow()
  })

  it('throws on unsupported version', () => {
    const obj = JSON.parse(exportScheduleToJson(makeSchedule()))
    obj.esc_schedule_version = 99
    expect(() => importScheduleFromJson(JSON.stringify(obj))).toThrow('Unsupported schedule version: 99')
  })

  it('throws on start_min out of range', () => {
    const obj = JSON.parse(exportScheduleToJson(makeSchedule()))
    obj.plan.list[0].start_min = 1500
    expect(() => importScheduleFromJson(JSON.stringify(obj))).toThrow()
  })

  it('throws on non-array target_ra_dec', () => {
    const obj = JSON.parse(exportScheduleToJson(makeSchedule()))
    obj.plan.list[0].target_ra_dec = 'bad'
    expect(() => importScheduleFromJson(JSON.stringify(obj))).toThrow()
  })
})
