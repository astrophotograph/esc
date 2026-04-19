import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleTargetCard } from '../components/ScheduleTargetCard'
import { useSchedulerStore, EMPTY_SCHEDULE } from '../../../stores/schedulerStore'
import type { ScheduleTarget } from '../../../stores/schedulerStore'

const TARGET: ScheduleTarget = {
  id: 1,
  targetName: 'M31',
  aliasName: 'Andromeda Galaxy',
  raDec: [10.68, 41.27],
  startMin: 1350, // 22:30
  durationMin: 60,
  lpFilter: false,
  mosaic: null,
}

beforeEach(() => {
  useSchedulerStore.setState({
    schedule: { ...EMPTY_SCHEDULE, targets: [TARGET], updatedAt: '' },
    nextId: 2,
  })
})

describe('ScheduleTargetCard', () => {
  it('displays the alias name', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    expect(screen.getByDisplayValue('Andromeda Galaxy')).toBeDefined()
  })

  it('displays catalog name as label', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    expect(screen.getByText('M31')).toBeDefined()
  })

  it('shows start time as HH:MM wall-clock', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    // startMin=1350 → 22:30
    expect(screen.getByDisplayValue('22:30')).toBeDefined()
  })

  it('updates alias name in store on change', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    const input = screen.getByDisplayValue('Andromeda Galaxy')
    fireEvent.change(input, { target: { value: 'Andromeda' } })
    expect(useSchedulerStore.getState().schedule.targets[0].aliasName).toBe('Andromeda')
  })

  it('updates start_min in store when time changes', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    const timeInput = screen.getByLabelText('Start time')
    fireEvent.change(timeInput, { target: { value: '23:00' } })
    expect(useSchedulerStore.getState().schedule.targets[0].startMin).toBe(1380)
  })

  it('updates duration in store', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    const durInput = screen.getByLabelText('Duration in minutes')
    fireEvent.change(durInput, { target: { value: '90' } })
    expect(useSchedulerStore.getState().schedule.targets[0].durationMin).toBe(90)
  })

  it('shows mosaic badge as None when mosaic is null', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    expect(screen.getByText(/None/)).toBeDefined()
  })

  it('shows mosaic badge with scale/angle when configured', () => {
    const t = { ...TARGET, mosaic: { scale: 1.5, angle: 45, starMapAngle: 0, panX: 0, panY: 0, zoom: 4.0 } }
    render(<ScheduleTargetCard target={t} />)
    expect(screen.getByText(/1\.5×/)).toBeDefined()
    expect(screen.getByText(/45°/)).toBeDefined()
  })

  it('removes target from store when remove button clicked', () => {
    render(<ScheduleTargetCard target={TARGET} />)
    const removeBtn = screen.getByLabelText('Remove Andromeda Galaxy')
    fireEvent.click(removeBtn)
    expect(useSchedulerStore.getState().schedule.targets).toHaveLength(0)
  })
})
