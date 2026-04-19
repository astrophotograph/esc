import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Types
export interface ObservationSession {
  id: string
  name: string
  telescopeId?: string
  startedAt: string
  endedAt?: string
  locationLat?: number
  locationLon?: number
  notes?: string
}

export interface ObservationLog {
  id: string
  sessionId: string
  targetName: string
  ra: number
  dec: number
  notes?: string
  rating?: number
  capturedAt: string
}

export interface VisibilityInfo {
  targetName: string
  isVisible: boolean
  altitude: number
  azimuth: number
  riseTime?: string
  setTime?: string
  transitTime?: string
  transitAltitude?: number
  bestTime?: string
  hoursVisible?: number
}

export interface TonightTarget {
  id: string
  name: string
  objectType: string
  magnitude?: number
  altitude: number
  azimuth: number
  constellation?: string
}

export interface ObserverLocation {
  latitude: number
  longitude: number
  elevation: number
  name?: string
  timezone?: string   // IANA tz string, e.g. "America/New_York"
  minAltitudeDeg?: number // visibility threshold (default 30)
}

interface SessionStore {
  // State
  sessions: ObservationSession[]
  currentSession: ObservationSession | null
  observationLogs: ObservationLog[]
  tonightTargets: TonightTarget[]
  location: ObserverLocation | null
  isLoadingTargets: boolean

  // Actions
  setSessions: (sessions: ObservationSession[]) => void
  addSession: (session: ObservationSession) => void
  updateSession: (id: string, updates: Partial<ObservationSession>) => void
  deleteSession: (id: string) => void
  setCurrentSession: (session: ObservationSession | null) => void

  setObservationLogs: (logs: ObservationLog[]) => void
  addObservationLog: (log: ObservationLog) => void
  deleteObservationLog: (id: string) => void

  setTonightTargets: (targets: TonightTarget[]) => void
  setIsLoadingTargets: (loading: boolean) => void

  setLocation: (location: ObserverLocation | null) => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      // Initial state
      sessions: [],
      currentSession: null,
      observationLogs: [],
      tonightTargets: [],
      location: null,
      isLoadingTargets: false,

      // Session actions
      setSessions: (sessions) => set({ sessions }),

      addSession: (session) => set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
      })),

      updateSession: (id, updates) => set((state) => ({
        sessions: state.sessions.map(s =>
          s.id === id ? { ...s, ...updates } : s
        ),
        currentSession: state.currentSession?.id === id
          ? { ...state.currentSession, ...updates }
          : state.currentSession
      })),

      deleteSession: (id) => set((state) => ({
        sessions: state.sessions.filter(s => s.id !== id),
        currentSession: state.currentSession?.id === id ? null : state.currentSession,
      })),

      setCurrentSession: (currentSession) => set({ currentSession }),

      // Observation log actions
      setObservationLogs: (observationLogs) => set({ observationLogs }),

      addObservationLog: (log) => set((state) => ({
        observationLogs: [log, ...state.observationLogs]
      })),

      deleteObservationLog: (id) => set((state) => ({
        observationLogs: state.observationLogs.filter(l => l.id !== id)
      })),

      // Tonight targets
      setTonightTargets: (tonightTargets) => set({ tonightTargets }),
      setIsLoadingTargets: (isLoadingTargets) => set({ isLoadingTargets }),

      // Location
      setLocation: (location) => set({ location }),
    }),
    {
      name: 'session-storage',
      partialize: (state) => ({
        // Only persist location
        location: state.location,
      }),
    }
  )
)
