import { beforeEach, describe, it, expect } from 'vitest'
import { useSchedulerStore, EMPTY_SCHEDULE } from '../../../stores/schedulerStore'
import type { ScheduleTarget } from '../../../stores/schedulerStore'

const makeTarget = (overrides: Partial<Omit<ScheduleTarget, 'id'>> = {}): Omit<ScheduleTarget, 'id'> => ({
  targetName: 'M31',
  aliasName: 'Andromeda Galaxy',
  raDec: [10.68, 41.27],
  startMin: 120,
  durationMin: 60,
  lpFilter: false,
  mosaic: null,
  ...overrides,
})

beforeEach(() => {
  useSchedulerStore.setState({ schedule: { ...EMPTY_SCHEDULE, updatedAt: '' }, nextId: 1 })
})

describe('addTarget', () => {
  it('assigns sequential ids starting at 1', () => {
    useSchedulerStore.getState().addTarget(makeTarget())
    useSchedulerStore.getState().addTarget(makeTarget({ targetName: 'M42' }))
    const { targets } = useSchedulerStore.getState().schedule
    expect(targets[0].id).toBe(1)
    expect(targets[1].id).toBe(2)
  })

  it('unique ids across multiple additions', () => {
    for (let i = 0; i < 5; i++) {
      useSchedulerStore.getState().addTarget(makeTarget({ targetName: `T${i}` }))
    }
    const ids = useSchedulerStore.getState().schedule.targets.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('updateTarget', () => {
  it('patches only specified fields', () => {
    useSchedulerStore.getState().addTarget(makeTarget())
    const id = useSchedulerStore.getState().schedule.targets[0].id
    useSchedulerStore.getState().updateTarget(id, { aliasName: 'Andromeda' })
    const target = useSchedulerStore.getState().schedule.targets[0]
    expect(target.aliasName).toBe('Andromeda')
    expect(target.targetName).toBe('M31')
  })

  it('is a no-op for unknown id', () => {
    useSchedulerStore.getState().addTarget(makeTarget())
    const before = useSchedulerStore.getState().schedule.targets.length
    useSchedulerStore.getState().updateTarget(9999, { aliasName: 'Ghost' })
    expect(useSchedulerStore.getState().schedule.targets.length).toBe(before)
  })
})

describe('removeTarget', () => {
  it('removes target by id', () => {
    useSchedulerStore.getState().addTarget(makeTarget())
    useSchedulerStore.getState().addTarget(makeTarget({ targetName: 'M42' }))
    const id = useSchedulerStore.getState().schedule.targets[0].id
    useSchedulerStore.getState().removeTarget(id)
    expect(useSchedulerStore.getState().schedule.targets.length).toBe(1)
    expect(useSchedulerStore.getState().schedule.targets[0].targetName).toBe('M42')
  })

  it('is a no-op for unknown id', () => {
    useSchedulerStore.getState().addTarget(makeTarget())
    useSchedulerStore.getState().removeTarget(9999)
    expect(useSchedulerStore.getState().schedule.targets.length).toBe(1)
  })
})

describe('reorderTargets', () => {
  it('moves item from index 0 to index 1', () => {
    useSchedulerStore.getState().addTarget(makeTarget({ targetName: 'A' }))
    useSchedulerStore.getState().addTarget(makeTarget({ targetName: 'B' }))
    useSchedulerStore.getState().reorderTargets(0, 1)
    const names = useSchedulerStore.getState().schedule.targets.map((t) => t.targetName)
    expect(names).toEqual(['B', 'A'])
  })

  it('clamps out-of-bounds indices', () => {
    useSchedulerStore.getState().addTarget(makeTarget({ targetName: 'A' }))
    useSchedulerStore.getState().addTarget(makeTarget({ targetName: 'B' }))
    useSchedulerStore.getState().reorderTargets(0, 100)
    // Should not throw, result is defined
    expect(useSchedulerStore.getState().schedule.targets.length).toBe(2)
  })
})

describe('importSchedule', () => {
  it('replaces entire schedule', () => {
    useSchedulerStore.getState().addTarget(makeTarget())
    const imported = {
      planName: 'Imported',
      updatedAt: new Date().toISOString(),
      targets: [{ ...makeTarget({ targetName: 'NGC 7000' }), id: 10 }],
    }
    useSchedulerStore.getState().importSchedule(imported)
    const { schedule } = useSchedulerStore.getState()
    expect(schedule.planName).toBe('Imported')
    expect(schedule.targets.length).toBe(1)
    expect(schedule.targets[0].targetName).toBe('NGC 7000')
  })
})

describe('clearSchedule', () => {
  it('resets to empty', () => {
    useSchedulerStore.getState().addTarget(makeTarget())
    useSchedulerStore.getState().setPlanName('Something')
    useSchedulerStore.getState().clearSchedule()
    const { schedule, nextId } = useSchedulerStore.getState()
    expect(schedule.targets).toHaveLength(0)
    expect(schedule.planName).toBe('New Plan')
    expect(nextId).toBe(1)
  })
})

describe('setPlanName', () => {
  it('updates plan name', () => {
    useSchedulerStore.getState().setPlanName('Summer Deep Sky')
    expect(useSchedulerStore.getState().schedule.planName).toBe('Summer Deep Sky')
  })
})
