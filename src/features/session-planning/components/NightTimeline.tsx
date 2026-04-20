import { useRef, useState, useCallback, useEffect } from 'react'
import { useSchedulerStore, type ScheduleTarget } from '../../../stores/schedulerStore'
import { targetsOverlap } from '../utils/timeConversion'

interface NightTimelineProps {
  targets: ScheduleTarget[]
  selectedId?: number | null
  onSelect?: (id: number) => void
}

const VIEW_START = 18 * 60  // 1080 — 18:00
const VIEW_END   = 30 * 60  // 1800 — 06:00 next day
const VIEW_SPAN  = VIEW_END - VIEW_START // 720 minutes
const SNAP = 5
const MIN_DURATION = 5
const HOUR_TICKS = [18, 20, 22, 0, 2, 4, 6]

function snap(min: number) {
  return Math.round(min / SNAP) * SNAP
}

// Convert actual startMin to view-space minutes (0 = 18:00, 720 = 06:00)
function toViewMin(startMin: number): number {
  const adjusted = startMin < VIEW_START - 60 ? startMin + 1440 : startMin
  return adjusted - VIEW_START
}

function toViewPct(startMin: number): number {
  return Math.max(0, Math.min(100, (toViewMin(startMin) / VIEW_SPAN) * 100))
}

function widthPct(startMin: number, durationMin: number): number {
  return Math.max(0.5, toViewPct(startMin + durationMin) - toViewPct(startMin))
}

function formatHour(h: number) {
  return `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`
}

function formatTime(min: number) {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

type DragState =
  | { kind: 'move';   id: number; startX: number; origViewStart: number; origDuration: number }
  | { kind: 'resize'; id: number; startX: number; origDuration: number }

export function NightTimeline({ targets, selectedId, onSelect }: NightTimelineProps) {
  const updateTarget = useSchedulerStore((s) => s.updateTarget)
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [localOverride, setLocalOverride] = useState<{ id: number; startMin?: number; durationMin?: number } | null>(null)
  // Track whether the pointer moved during a drag (to distinguish click from drag)
  const hasMoved = useRef(false)

  const pxToMin = useCallback((dx: number): number => {
    const w = containerRef.current?.clientWidth ?? 1
    return (dx / w) * VIEW_SPAN
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag) return
    hasMoved.current = true
    const delta = pxToMin(e.clientX - drag.startX)

    if (drag.kind === 'move') {
      const rawViewMin = drag.origViewStart + delta
      const newViewMin = Math.max(0, Math.min(VIEW_SPAN - drag.origDuration, snap(rawViewMin)))
      const newStart = (newViewMin + VIEW_START) % 1440
      setLocalOverride({ id: drag.id, startMin: newStart })
    } else {
      const newDur = Math.max(MIN_DURATION, snap(drag.origDuration + delta))
      const t = targets.find(t => t.id === drag.id)
      const maxDur = t ? VIEW_SPAN - toViewMin(t.startMin) : VIEW_SPAN
      setLocalOverride({ id: drag.id, durationMin: Math.min(maxDur, newDur) })
    }
  }, [drag, pxToMin, targets])

  const onMouseUp = useCallback(() => {
    if (!drag) return
    if (!hasMoved.current) {
      // Treat as a click — select the block
      onSelect?.(drag.id)
    } else if (localOverride) {
      updateTarget(drag.id, localOverride.startMin != null
        ? { startMin: localOverride.startMin }
        : { durationMin: localOverride.durationMin })
    }
    setDrag(null)
    setLocalOverride(null)
  }, [drag, localOverride, updateTarget, onSelect])

  useEffect(() => {
    if (!drag) return
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [drag, onMouseMove, onMouseUp])

  if (targets.length === 0) return null

  const displayTargets = targets.map(t =>
    localOverride?.id === t.id ? { ...t, ...localOverride } : t
  )

  const overlappingIds = new Set<number>()
  for (let i = 0; i < displayTargets.length; i++) {
    for (let j = i + 1; j < displayTargets.length; j++) {
      if (targetsOverlap(displayTargets[i], displayTargets[j])) {
        overlappingIds.add(displayTargets[i].id)
        overlappingIds.add(displayTargets[j].id)
      }
    }
  }

  return (
    <div className="select-none" style={{ cursor: drag ? (drag.kind === 'resize' ? 'ew-resize' : 'grabbing') : 'default' }}>
      <div ref={containerRef} className="relative h-10 rounded bg-muted/30 overflow-hidden">
        <div className="absolute inset-0 bg-indigo-950/40" />
        {/* Midnight marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-indigo-400/40"
          style={{ left: `${((1440 - VIEW_START) / VIEW_SPAN) * 100}%` }}
        />

        {displayTargets.map((t) => {
          const left  = toViewPct(t.startMin)
          const width = widthPct(t.startMin, t.durationMin)
          const overlaps = overlappingIds.has(t.id)
          const isActive = drag?.id === t.id
          const isSelected = selectedId === t.id && !drag
          const bg = overlaps
            ? 'rgb(245 158 11 / 0.75)'
            : isActive
            ? 'rgb(129 140 248 / 0.9)'
            : isSelected
            ? 'rgb(167 139 250 / 0.95)'
            : 'rgb(99 102 241 / 0.7)'

          const tooltip = `${t.aliasName}  ${formatTime(t.startMin)} · ${t.durationMin}m`

          return (
            <div
              key={t.id}
              className="absolute top-1 bottom-1 rounded-sm flex items-center overflow-hidden group"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: bg,
                transition: drag ? 'none' : 'left 0.1s, width 0.1s',
                outline: isSelected ? '2px solid rgb(167 139 250)' : undefined,
              }}
              title={tooltip}
            >
              {/* Move handle — whole block except resize strip */}
              <div
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
                style={{ right: '6px' }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  hasMoved.current = false
                  setDrag({ kind: 'move', id: t.id, startX: e.clientX, origViewStart: toViewMin(t.startMin), origDuration: t.durationMin })
                }}
              />
              <span className="pointer-events-none px-1 text-[10px] text-white font-medium truncate leading-none">
                {t.aliasName}
              </span>

              {/* Resize handle — right edge */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 rounded-r-sm"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  hasMoved.current = false
                  setDrag({ kind: 'resize', id: t.id, startX: e.clientX, origDuration: t.durationMin })
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Hour labels */}
      <div className="relative h-4 mt-0.5">
        {HOUR_TICKS.map((h) => {
          const pct = ((((h < 12 ? h + 24 : h) * 60) - VIEW_START) / VIEW_SPAN) * 100
          if (pct < 0 || pct > 100) return null
          return (
            <span key={h} className="absolute text-[10px] text-muted-foreground -translate-x-1/2" style={{ left: `${pct}%` }}>
              {formatHour(h)}
            </span>
          )
        })}
        {/* Live time tooltip while dragging */}
        {drag && localOverride && (() => {
          const t = displayTargets.find(t => t.id === drag.id)
          if (!t) return null
          const pct = drag.kind === 'move'
            ? toViewPct(t.startMin) + widthPct(t.startMin, t.durationMin) / 2
            : toViewPct(t.startMin) + widthPct(t.startMin, t.durationMin)
          return (
            <span
              className="absolute -top-0.5 bg-popover border text-[10px] px-1 py-0.5 rounded -translate-x-1/2 pointer-events-none z-10 whitespace-nowrap"
              style={{ left: `${pct}%` }}
            >
              {drag.kind === 'move'
                ? `${formatTime(t.startMin)} · ${t.durationMin}m`
                : `${t.durationMin}m`}
            </span>
          )
        })()}
      </div>
    </div>
  )
}
