import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Types
export interface TelescopeInfo {
  id: string
  host: string
  port: number
  name?: string
  serial_number?: string
  product_model?: string
  location?: string
  discovery_method?: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
}

export interface TelescopeStatus {
  ra?: number
  dec?: number
  alt?: number
  az?: number
  tracking?: boolean
  slewing?: boolean
  parked?: boolean
  focuserPosition?: number
}

export interface TelescopeSettings {
  exposure: number
  gain: number
  brightness?: number
  contrast?: number
  autoExposure: boolean
}

export interface ActivityLogEntry {
  id: string
  telescopeId: string
  timestamp: Date
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
}

interface TelescopeStore {
  // State
  telescopes: TelescopeInfo[]
  currentTelescopeId: string | null
  telescopeStatus: Record<string, TelescopeStatus>
  telescopeSettings: Record<string, TelescopeSettings>
  activityLog: ActivityLogEntry[]
  isDiscovering: boolean

  // Computed
  getCurrentTelescope: () => TelescopeInfo | undefined
  getCurrentStatus: () => TelescopeStatus | undefined
  getCurrentSettings: () => TelescopeSettings | undefined

  // Telescope actions
  setTelescopes: (telescopes: TelescopeInfo[]) => void
  addTelescope: (telescope: TelescopeInfo) => void
  removeTelescope: (id: string) => void
  updateTelescope: (id: string, updates: Partial<TelescopeInfo>) => void
  setCurrentTelescope: (id: string | null) => void

  // Status actions
  updateTelescopeStatus: (id: string, status: Partial<TelescopeStatus>) => void
  clearTelescopeStatus: (id: string) => void

  // Settings actions
  updateTelescopeSettings: (id: string, settings: Partial<TelescopeSettings>) => void

  // Activity log actions
  addActivity: (telescopeId: string, type: ActivityLogEntry['type'], message: string) => void
  clearActivityLog: () => void

  // Discovery
  setIsDiscovering: (discovering: boolean) => void
}

const DEFAULT_SETTINGS: TelescopeSettings = {
  exposure: 1000,
  gain: 80,
  brightness: 50,
  contrast: 50,
  autoExposure: false,
}

export const useTelescopeStore = create<TelescopeStore>()(
  persist(
    (set, get) => ({
      // Initial state
      telescopes: [],
      currentTelescopeId: null,
      telescopeStatus: {},
      telescopeSettings: {},
      activityLog: [],
      isDiscovering: false,

      // Computed
      getCurrentTelescope: () => {
        const { telescopes, currentTelescopeId } = get()
        return telescopes.find(t => t.id === currentTelescopeId)
      },

      getCurrentStatus: () => {
        const { telescopeStatus, currentTelescopeId } = get()
        return currentTelescopeId ? telescopeStatus[currentTelescopeId] : undefined
      },

      getCurrentSettings: () => {
        const { telescopeSettings, currentTelescopeId } = get()
        return currentTelescopeId ? telescopeSettings[currentTelescopeId] : undefined
      },

      // Telescope actions
      setTelescopes: (telescopes) => set({ telescopes }),

      addTelescope: (telescope) => set((state) => {
        // Don't add duplicates
        if (state.telescopes.some(t => t.id === telescope.id)) {
          return state
        }
        return {
          telescopes: [...state.telescopes, telescope],
          telescopeSettings: {
            ...state.telescopeSettings,
            [telescope.id]: DEFAULT_SETTINGS,
          }
        }
      }),

      removeTelescope: (id) => set((state) => {
        const { [id]: _, ...remainingStatus } = state.telescopeStatus
        const { [id]: __, ...remainingSettings } = state.telescopeSettings
        return {
          telescopes: state.telescopes.filter(t => t.id !== id),
          currentTelescopeId: state.currentTelescopeId === id ? null : state.currentTelescopeId,
          telescopeStatus: remainingStatus,
          telescopeSettings: remainingSettings,
        }
      }),

      updateTelescope: (id, updates) => set((state) => ({
        telescopes: state.telescopes.map(t =>
          t.id === id ? { ...t, ...updates } : t
        )
      })),

      setCurrentTelescope: (id) => set({ currentTelescopeId: id }),

      // Status actions
      updateTelescopeStatus: (id, status) => set((state) => ({
        telescopeStatus: {
          ...state.telescopeStatus,
          [id]: { ...state.telescopeStatus[id], ...status }
        }
      })),

      clearTelescopeStatus: (id) => set((state) => {
        const { [id]: _, ...remaining } = state.telescopeStatus
        return { telescopeStatus: remaining }
      }),

      // Settings actions
      updateTelescopeSettings: (id, settings) => set((state) => ({
        telescopeSettings: {
          ...state.telescopeSettings,
          [id]: { ...(state.telescopeSettings[id] || DEFAULT_SETTINGS), ...settings }
        }
      })),

      // Activity log actions
      addActivity: (telescopeId, type, message) => set((state) => ({
        activityLog: [
          {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            telescopeId,
            timestamp: new Date(),
            type,
            message,
          },
          ...state.activityLog.slice(0, 99), // Keep last 100 entries
        ]
      })),

      clearActivityLog: () => set({ activityLog: [] }),

      // Discovery
      setIsDiscovering: (isDiscovering) => set({ isDiscovering }),
    }),
    {
      name: 'telescope-storage',
      partialize: (state) => ({
        // Only persist these fields
        telescopes: state.telescopes,
        currentTelescopeId: state.currentTelescopeId,
        telescopeSettings: state.telescopeSettings,
      }),
    }
  )
)
