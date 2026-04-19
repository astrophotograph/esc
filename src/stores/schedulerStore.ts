import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface MosaicConfig {
  scale: number        // 1.0–3.0
  angle: number        // −90 to +90 degrees
  starMapAngle: number // always 0.0
  panX: number         // SVG-coordinate offset from target center
  panY: number
  zoom: number         // framing editor zoom level (restored on re-open)
}

export interface ScheduleTarget {
  id: number
  targetName: string
  aliasName: string
  raDec: [number, number] // [ra_deg, dec_deg]
  startMin: number        // minutes after local midnight (0–1440)
  durationMin: number
  lpFilter: boolean
  mosaic: MosaicConfig | null
}

export interface Schedule {
  planName: string
  targets: ScheduleTarget[]
  updatedAt: string // ISO date string
}

export const EMPTY_SCHEDULE: Schedule = {
  planName: 'New Plan',
  targets: [],
  updatedAt: new Date().toISOString(),
}

interface SchedulerStore {
  schedule: Schedule
  nextId: number
  setPlanName: (name: string) => void
  addTarget: (t: Omit<ScheduleTarget, 'id'>) => void
  updateTarget: (id: number, patch: Partial<ScheduleTarget>) => void
  removeTarget: (id: number) => void
  reorderTargets: (fromIndex: number, toIndex: number) => void
  importSchedule: (s: Schedule) => void
  clearSchedule: () => void
}

export const useSchedulerStore = create<SchedulerStore>()(
  persist(
    (set) => ({
      schedule: { ...EMPTY_SCHEDULE, updatedAt: new Date().toISOString() },
      nextId: 1,

      setPlanName: (planName) =>
        set((state) => ({
          schedule: { ...state.schedule, planName, updatedAt: new Date().toISOString() },
        })),

      addTarget: (t) =>
        set((state) => {
          const id = state.nextId
          return {
            nextId: id + 1,
            schedule: {
              ...state.schedule,
              targets: [...state.schedule.targets, { ...t, id }],
              updatedAt: new Date().toISOString(),
            },
          }
        }),

      updateTarget: (id, patch) =>
        set((state) => ({
          schedule: {
            ...state.schedule,
            targets: state.schedule.targets.map((t) =>
              t.id === id ? { ...t, ...patch } : t
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      removeTarget: (id) =>
        set((state) => ({
          schedule: {
            ...state.schedule,
            targets: state.schedule.targets.filter((t) => t.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      reorderTargets: (fromIndex, toIndex) =>
        set((state) => {
          const targets = [...state.schedule.targets]
          const clampedFrom = Math.max(0, Math.min(fromIndex, targets.length - 1))
          const clampedTo = Math.max(0, Math.min(toIndex, targets.length - 1))
          const [item] = targets.splice(clampedFrom, 1)
          targets.splice(clampedTo, 0, item)
          return {
            schedule: { ...state.schedule, targets, updatedAt: new Date().toISOString() },
          }
        }),

      importSchedule: (schedule) =>
        set(() => {
          const maxId = schedule.targets.reduce((m, t) => Math.max(m, t.id), 0)
          return { schedule, nextId: maxId + 1 }
        }),

      clearSchedule: () =>
        set({
          schedule: { ...EMPTY_SCHEDULE, updatedAt: new Date().toISOString() },
          nextId: 1,
        }),
    }),
    { name: 'scheduler-storage' }
  )
)
