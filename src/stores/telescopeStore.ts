import { create } from 'zustand'

export interface TelescopeInfo {
  id: string
  host: string
  port: number
  name?: string
  serial_number?: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
}

export interface TelescopeStatus {
  ra?: number
  dec?: number
  alt?: number
  az?: number
  tracking?: boolean
  slewing?: boolean
  parked?: boolean
}

interface TelescopeStore {
  // State
  telescopes: TelescopeInfo[]
  currentTelescopeId: string | null
  telescopeStatus: Record<string, TelescopeStatus>

  // Actions
  setTelescopes: (telescopes: TelescopeInfo[]) => void
  addTelescope: (telescope: TelescopeInfo) => void
  removeTelescope: (id: string) => void
  updateTelescope: (id: string, updates: Partial<TelescopeInfo>) => void
  setCurrentTelescope: (id: string | null) => void
  updateTelescopeStatus: (id: string, status: TelescopeStatus) => void
}

export const useTelescopeStore = create<TelescopeStore>((set) => ({
  // Initial state
  telescopes: [],
  currentTelescopeId: null,
  telescopeStatus: {},

  // Actions
  setTelescopes: (telescopes) => set({ telescopes }),

  addTelescope: (telescope) => set((state) => ({
    telescopes: [...state.telescopes, telescope]
  })),

  removeTelescope: (id) => set((state) => ({
    telescopes: state.telescopes.filter(t => t.id !== id),
    currentTelescopeId: state.currentTelescopeId === id ? null : state.currentTelescopeId
  })),

  updateTelescope: (id, updates) => set((state) => ({
    telescopes: state.telescopes.map(t =>
      t.id === id ? { ...t, ...updates } : t
    )
  })),

  setCurrentTelescope: (id) => set({ currentTelescopeId: id }),

  updateTelescopeStatus: (id, status) => set((state) => ({
    telescopeStatus: {
      ...state.telescopeStatus,
      [id]: { ...state.telescopeStatus[id], ...status }
    }
  }))
}))
