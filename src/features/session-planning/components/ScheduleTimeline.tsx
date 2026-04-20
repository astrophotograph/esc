import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { AlertTriangle, Trash2, CalendarClock } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog'
import { useSchedulerStore } from '../../../stores/schedulerStore'
import { targetsOverlap } from '../utils/timeConversion'
import { ScheduleTargetCard } from './ScheduleTargetCard'
import { NightTimeline } from './NightTimeline'

export function ScheduleTimeline() {
  const { schedule, reorderTargets, clearSchedule } = useSchedulerStore()
  const targets = [...schedule.targets].sort((a, b) => a.startMin - b.startMin)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = targets.findIndex((t) => t.id === active.id)
    const toIndex = targets.findIndex((t) => t.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTargets(fromIndex, toIndex)
    }
  }

  // Detect overlapping time windows
  const overlappingPairs: [number, number][] = []
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      if (targetsOverlap(targets[i], targets[j])) {
        overlappingPairs.push([targets[i].id, targets[j].id])
      }
    }
  }
  const hasOverlaps = overlappingPairs.length > 0

  const totalMinutes = targets.reduce((sum, t) => sum + t.durationMin, 0)
  const totalHours = (totalMinutes / 60).toFixed(1)

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Night timeline */}
      {targets.length > 0 && <NightTimeline targets={targets} selectedId={selectedId} onSelect={setSelectedId} />}

      {/* Overlap warning */}
      {hasOverlaps && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-400"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {overlappingPairs.length} overlapping time window
            {overlappingPairs.length > 1 ? 's' : ''} detected. Adjust start times to avoid
            conflicts.
          </span>
        </div>
      )}

      {/* Target list */}
      <div className="flex-1 overflow-auto">
        {targets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
            <CalendarClock className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No targets in schedule</p>
            <p className="text-xs mt-1">Search for objects on the left and click Add</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={targets.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {targets.map((target) => (
                  <ScheduleTargetCard key={target.id} target={target} isSelected={selectedId === target.id} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer summary + clear */}
      {targets.length > 0 && (
        <div className="border-t pt-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {targets.length} target{targets.length !== 1 ? 's' : ''} · {totalHours}h total
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear schedule?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {targets.length} target
                  {targets.length !== 1 ? 's' : ''} from the schedule. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearSchedule} className="bg-destructive text-destructive-foreground">
                  Clear all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
