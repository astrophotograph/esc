import { create } from 'zustand'

export interface ImagingSession {
  telescopeId: string
  targetName?: string
  exposure: number
  gain: number
  frameCount: number
  isActive: boolean
  startedAt?: Date
}

interface ImagingStore {
  // State
  sessions: Record<string, ImagingSession>

  // Actions
  startSession: (telescopeId: string, session: Omit<ImagingSession, 'telescopeId'>) => void
  stopSession: (telescopeId: string) => void
  updateSession: (telescopeId: string, updates: Partial<ImagingSession>) => void
}

export const useImagingStore = create<ImagingStore>((set) => ({
  // Initial state
  sessions: {},

  // Actions
  startSession: (telescopeId, session) => set((state) => ({
    sessions: {
      ...state.sessions,
      [telescopeId]: { ...session, telescopeId, isActive: true }
    }
  })),

  stopSession: (telescopeId) => set((state) => ({
    sessions: {
      ...state.sessions,
      [telescopeId]: state.sessions[telescopeId]
        ? { ...state.sessions[telescopeId], isActive: false }
        : state.sessions[telescopeId]
    }
  })),

  updateSession: (telescopeId, updates) => set((state) => ({
    sessions: {
      ...state.sessions,
      [telescopeId]: state.sessions[telescopeId]
        ? { ...state.sessions[telescopeId], ...updates }
        : state.sessions[telescopeId]
    }
  }))
}))
