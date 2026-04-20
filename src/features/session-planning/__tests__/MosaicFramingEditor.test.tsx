import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MosaicFramingEditor } from '../components/MosaicFramingEditor'
import { useSchedulerStore, EMPTY_SCHEDULE } from '../../../stores/schedulerStore'
import type { ScheduleTarget } from '../../../stores/schedulerStore'

const TARGET: ScheduleTarget = {
  id: 1,
  targetName: 'M31',
  aliasName: 'Andromeda',
  raDec: [10.68, 41.27],
  startMin: 120,
  durationMin: 60,
  lpFilter: false,
  mosaic: null,
}

const onClose = () => {}

beforeEach(() => {
  useSchedulerStore.setState({
    schedule: { ...EMPTY_SCHEDULE, targets: [TARGET], updatedAt: '' },
    nextId: 2,
  })
})

describe('MosaicFramingEditor', () => {
  it('renders when open', () => {
    render(
      <MosaicFramingEditor targetId={1} targetName="M31" raDec={[10.68, 41.27]} initial={null} open={true} onClose={onClose} />
    )
    expect(screen.getByText('Mosaic Framing — M31')).toBeDefined()
  })

  it('does not render when closed', () => {
    render(
      <MosaicFramingEditor targetId={1} targetName="M31" raDec={[10.68, 41.27]} initial={null} open={false} onClose={onClose} />
    )
    expect(screen.queryByText('Mosaic Framing')).toBeNull()
  })

  it('Apply saves mosaic config to store when non-trivial', () => {
    render(
      <MosaicFramingEditor
        targetId={1}
        targetName="M31"
        raDec={[10.68, 41.27]}
        initial={{ scale: 1.5, angle: 45, starMapAngle: 0, panX: 0, panY: 0, zoom: 4.0 }}
        open={true}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByText('Apply'))
    const mosaic = useSchedulerStore.getState().schedule.targets[0].mosaic
    expect(mosaic).not.toBeNull()
    expect(mosaic!.scale).toBe(1.5)
    expect(mosaic!.angle).toBe(45)
    expect(mosaic!.starMapAngle).toBe(0.0)
    expect(mosaic!.panX).toBe(0)
    expect(mosaic!.panY).toBe(0)
  })

  it('Apply sets mosaic to null when scale=1.0 and angle=0', () => {
    render(
      <MosaicFramingEditor
        targetId={1}
        targetName="M31"
        raDec={[10.68, 41.27]}
        initial={{ scale: 1.0, angle: 0, starMapAngle: 0, panX: 0, panY: 0, zoom: 4.0 }}
        open={true}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByText('Apply'))
    expect(useSchedulerStore.getState().schedule.targets[0].mosaic).toBeNull()
  })

  it('Cancel does not modify the store', () => {
    render(
      <MosaicFramingEditor targetId={1} targetName="M31" raDec={[10.68, 41.27]} initial={null} open={true} onClose={onClose} />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(useSchedulerStore.getState().schedule.targets[0].mosaic).toBeNull()
  })

  it('shows Apply and Cancel buttons', () => {
    render(
      <MosaicFramingEditor targetId={1} targetName="M31" raDec={[10.68, 41.27]} initial={null} open={true} onClose={onClose} />
    )
    expect(screen.getByText('Apply')).toBeDefined()
    expect(screen.getByText('Cancel')).toBeDefined()
  })
})
