import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleTimeline } from '../components/ScheduleTimeline'
import { useSchedulerStore, EMPTY_SCHEDULE } from '../../../stores/schedulerStore'
import type { ScheduleTarget } from '../../../stores/schedulerStore'

const T1: ScheduleTarget = {
  id: 1,
  targetName: 'M31',
  aliasName: 'Andromeda',
  raDec: [10.68, 41.27],
  startMin: 60,
  durationMin: 60,
  lpFilter: false,
  mosaic: null,
}

const T2: ScheduleTarget = {
  id: 2,
  targetName: 'M42',
  aliasName: 'Orion',
  raDec: [83.82, -5.39],
  startMin: 120,
  durationMin: 60,
  lpFilter: false,
  mosaic: null,
}

const T_OVERLAP: ScheduleTarget = {
  id: 3,
  targetName: 'M45',
  aliasName: 'Pleiades',
  raDec: [56.75, 24.12],
  startMin: 90,  // overlaps T1 [60,120)
  durationMin: 60,
  lpFilter: false,
  mosaic: null,
}

beforeEach(() => {
  useSchedulerStore.setState(
    { schedule: { ...EMPTY_SCHEDULE, targets: [], updatedAt: '' }, nextId: 1 },
  )
})

describe('ScheduleTimeline', () => {
  it('renders all targets', () => {
    useSchedulerStore.setState(
      { schedule: { ...EMPTY_SCHEDULE, targets: [T1, T2], updatedAt: '' }, nextId: 3 },
      true
    )
    render(<ScheduleTimeline />)
    expect(screen.getByDisplayValue('Andromeda')).toBeDefined()
    expect(screen.getByDisplayValue('Orion')).toBeDefined()
  })

  it('shows empty state when schedule is empty', () => {
    render(<ScheduleTimeline />)
    expect(screen.getByText(/No targets in schedule/)).toBeDefined()
  })

  it('shows overlap warning when two targets overlap', () => {
    useSchedulerStore.setState(
      { schedule: { ...EMPTY_SCHEDULE, targets: [T1, T_OVERLAP], updatedAt: '' }, nextId: 4 },
      true
    )
    render(<ScheduleTimeline />)
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.getByText(/overlapping time window/)).toBeDefined()
  })

  it('does not show overlap warning for non-overlapping targets', () => {
    useSchedulerStore.setState(
      { schedule: { ...EMPTY_SCHEDULE, targets: [T1, T2], updatedAt: '' }, nextId: 3 },
      true
    )
    render(<ScheduleTimeline />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows clear button when targets exist', () => {
    useSchedulerStore.setState(
      { schedule: { ...EMPTY_SCHEDULE, targets: [T1], updatedAt: '' }, nextId: 2 },
      true
    )
    render(<ScheduleTimeline />)
    expect(screen.getByText('Clear')).toBeDefined()
  })
})
