import { z } from 'zod'
import type { Schedule, ScheduleTarget, MosaicConfig } from '../../../stores/schedulerStore'

// ─── Wire format types ────────────────────────────────────────────────────────

export interface WireMosaic {
  scale: number
  angle: number
  star_map_angle: number
}

export interface WireTarget {
  target_id: number
  target_name: string
  target_ra_dec: [number, number]
  alias_name: string
  lp_filter: boolean
  start_min: number
  duration_min: number
  mosaic?: WireMosaic
}

export interface WirePlan {
  plan_name: string
  update_time_seestar: string
  list: WireTarget[]
}

export interface ExportFile {
  esc_schedule_version: number
  exported_at: string
  plan: WirePlan
}

// ─── Zod validation schemas ───────────────────────────────────────────────────

const mosaicSchema = z.object({
  scale: z.number().min(1).max(3),
  angle: z.number().min(-90).max(90),
  star_map_angle: z.number(),
})

const targetSchema = z.object({
  target_id: z.number(),
  target_name: z.string(),
  target_ra_dec: z.tuple([z.number(), z.number()]),
  alias_name: z.string(),
  lp_filter: z.boolean(),
  start_min: z.number().min(0).max(1440),
  duration_min: z.number().min(1).max(1440),
  mosaic: mosaicSchema.nullable().optional(),
})

const planSchema = z.object({
  plan_name: z.string().min(1),
  update_time_seestar: z.string(),
  list: z.array(targetSchema),
})

const exportFileSchema = z.object({
  esc_schedule_version: z.number(),
  exported_at: z.string(),
  plan: planSchema,
})

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isTrivialMosaic(m: MosaicConfig): boolean {
  return m.scale === 1.0 && m.angle === 0.0 && m.starMapAngle === 0.0
}

function targetToWire(t: ScheduleTarget): WireTarget {
  const wire: WireTarget = {
    target_id: t.id,
    target_name: t.targetName,
    target_ra_dec: t.raDec,
    alias_name: t.aliasName,
    lp_filter: t.lpFilter,
    start_min: t.startMin,
    duration_min: t.durationMin,
  }
  if (t.mosaic && !isTrivialMosaic(t.mosaic)) {
    wire.mosaic = {
      scale: t.mosaic.scale,
      angle: t.mosaic.angle,
      star_map_angle: t.mosaic.starMapAngle,
    }
  }
  return wire
}

function wireToTarget(w: z.infer<typeof targetSchema>): ScheduleTarget {
  const mosaic: MosaicConfig | null = w.mosaic
    ? { scale: w.mosaic.scale, angle: w.mosaic.angle, starMapAngle: w.mosaic.star_map_angle, panX: 0, panY: 0, zoom: 4.0 }
    : null
  return {
    id: w.target_id,
    targetName: w.target_name,
    aliasName: w.alias_name,
    raDec: w.target_ra_dec,
    startMin: w.start_min,
    durationMin: w.duration_min,
    lpFilter: w.lp_filter,
    mosaic,
  }
}

function seestarDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Serialize a Schedule to the set_view_plan wire format, sorted by start_min. */
export function scheduleToWireFormat(s: Schedule): WirePlan {
  const sorted = [...s.targets].sort((a, b) => a.startMin - b.startMin)
  return {
    plan_name: s.planName,
    update_time_seestar: seestarDate(new Date()),
    list: sorted.map(targetToWire),
  }
}

/** Serialize a Schedule to a JSON string for file export. */
export function exportScheduleToJson(s: Schedule): string {
  const file: ExportFile = {
    esc_schedule_version: 1,
    exported_at: new Date().toISOString(),
    plan: scheduleToWireFormat(s),
  }
  return JSON.stringify(file, null, 2)
}

/** Parse a JSON string into a Schedule; throws a descriptive Error on invalid input. */
export function importScheduleFromJson(json: string): Schedule {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON: the file could not be parsed')
  }

  const result = exportFileSchema.safeParse(parsed)
  if (!result.success) {
    const first = result.error.errors[0]
    const path = first.path.join('.') || 'root'
    throw new Error(`Invalid schedule file at "${path}": ${first.message}`)
  }

  const file = result.data
  if (file.esc_schedule_version !== 1) {
    throw new Error(`Unsupported schedule version: ${file.esc_schedule_version}`)
  }

  return {
    planName: file.plan.plan_name,
    updatedAt: file.exported_at,
    targets: file.plan.list.map(wireToTarget),
  }
}
