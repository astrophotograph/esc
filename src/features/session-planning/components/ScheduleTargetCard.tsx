import { useState } from 'react'
import { GripVertical, Trash2, Grid3x3 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Switch } from '../../../components/ui/switch'
import { Label } from '../../../components/ui/label'
import { useSchedulerStore } from '../../../stores/schedulerStore'
import { wallClockToStartMin, startMinToWallClock } from '../utils/timeConversion'
import { MosaicFramingEditor } from './MosaicFramingEditor'
import type { ScheduleTarget } from '../../../stores/schedulerStore'

interface ScheduleTargetCardProps {
  target: ScheduleTarget
}

export function ScheduleTargetCard({ target }: ScheduleTargetCardProps) {
  const updateTarget = useSchedulerStore((s) => s.updateTarget)
  const removeTarget = useSchedulerStore((s) => s.removeTarget)
  const [mosaicOpen, setMosaicOpen] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: target.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleAliasChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    updateTarget(target.id, { aliasName: e.target.value })

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    updateTarget(target.id, { startMin: wallClockToStartMin(e.target.value) })

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10)
    if (!isNaN(v) && v > 0) updateTarget(target.id, { durationMin: v })
  }

  const handleLpFilterChange = (checked: boolean) =>
    updateTarget(target.id, { lpFilter: checked })

  const mosaicLabel = target.mosaic
    ? `${target.mosaic.scale.toFixed(1)}× / ${target.mosaic.angle}°`
    : 'None'

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg bg-card p-3">
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Alias name */}
          <div>
            <Label className="text-xs text-muted-foreground">{target.targetName}</Label>
            <Input
              value={target.aliasName}
              onChange={handleAliasChange}
              className="h-8 text-sm"
              placeholder="Display name"
              aria-label="Display name"
            />
          </div>

          {/* Time + duration row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <Label className="text-xs text-muted-foreground">Start (local)</Label>
              <Input
                type="time"
                value={startMinToWallClock(target.startMin)}
                onChange={handleTimeChange}
                className="h-8 text-sm w-28"
                aria-label="Start time"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-xs text-muted-foreground">Duration (min)</Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={target.durationMin}
                onChange={handleDurationChange}
                className="h-8 text-sm w-20"
                aria-label="Duration in minutes"
              />
            </div>

            {/* LP filter */}
            <div className="flex items-center gap-1.5 mt-4">
              <Switch
                id={`lp-${target.id}`}
                checked={target.lpFilter}
                onCheckedChange={handleLpFilterChange}
                aria-label="Light pollution filter"
              />
              <Label htmlFor={`lp-${target.id}`} className="text-xs cursor-pointer">
                LP Filter
              </Label>
            </div>

            {/* Mosaic */}
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setMosaicOpen(true)}
                aria-label="Configure mosaic"
              >
                <Grid3x3 className="h-3 w-3" />
                {mosaicLabel}
              </Button>
            </div>
          </div>
        </div>

        {/* Remove */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => removeTarget(target.id)}
          aria-label={`Remove ${target.aliasName}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <MosaicFramingEditor
        targetId={target.id}
        targetName={target.targetName}
        raDec={target.raDec}
        initial={target.mosaic}
        open={mosaicOpen}
        onClose={() => setMosaicOpen(false)}
      />
    </div>
  )
}
