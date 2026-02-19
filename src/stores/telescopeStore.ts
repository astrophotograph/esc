import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Types
export type TelescopeProtocol = 'seestar' | 'alpaca'

export type ConnectionType = 'direct' | 'ssh'

export interface TelescopeInfo {
  id: string
  host: string
  port: number
  protocol?: TelescopeProtocol
  name?: string
  friendlyName?: string  // User-defined display name
  serial_number?: string
  product_model?: string
  location?: string
  discovery_method?: string
  sectionId?: string  // Section this telescope belongs to
  sortOrder?: number  // Order within section
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
  // SSH tunnel fields (for remote connections)
  connectionType?: ConnectionType
  sshHost?: string
  sshPort?: number        // default 22
  sshUser?: string
  sshKeyPath?: string     // default ~/.ssh/id_rsa
  remoteHost?: string     // Seestar IP on the remote network
}

export interface TelescopeSection {
  id: string
  name: string
  sortOrder: number
  collapsed?: boolean
}

export interface BalanceSensorData {
  x?: number
  y?: number
  z?: number
  angle?: number
}

export interface TelescopeStatus {
  connected?: boolean
  ra?: number
  dec?: number
  alt?: number
  az?: number
  tracking?: boolean
  slewing?: boolean
  parked?: boolean
  focuserPosition?: number
  gain?: number
  gainMode?: string
  mountType?: string
  isTracking?: boolean
  isGoto?: boolean
  temperatureC?: number
  batteryPercent?: number
  humidityPercent?: number
  dewHeaterPower?: number
  viewState?: string
  stage?: string
  stackedFrame?: number
  targetName?: string
  freeMb?: number
  totalMb?: number
  balanceSensor?: BalanceSensorData
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
  // Hydration state
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void

  // State
  telescopes: TelescopeInfo[]
  sections: TelescopeSection[]
  currentTelescopeId: string | null
  telescopeStatus: Record<string, TelescopeStatus>
  telescopeSettings: Record<string, TelescopeSettings>
  activityLog: ActivityLogEntry[]
  isDiscovering: boolean

  // Computed
  getCurrentTelescope: () => TelescopeInfo | undefined
  getCurrentStatus: () => TelescopeStatus | undefined
  getCurrentSettings: () => TelescopeSettings | undefined
  getTelescopesBySection: () => { section: TelescopeSection | null; telescopes: TelescopeInfo[] }[]

  // Telescope actions
  setTelescopes: (telescopes: TelescopeInfo[]) => void
  mergeTelescopes: (telescopes: TelescopeInfo[]) => void
  addTelescope: (telescope: TelescopeInfo) => void
  removeTelescope: (id: string) => void
  updateTelescope: (id: string, updates: Partial<TelescopeInfo>) => void
  setCurrentTelescope: (id: string | null) => void
  reorderTelescope: (telescopeId: string, newSectionId: string | null, newSortOrder: number) => void
  swapTelescopeOrder: (telescopeId1: string, order1: number, telescopeId2: string, order2: number) => void

  // Section actions
  addSection: (name: string) => void
  removeSection: (id: string) => void
  updateSection: (id: string, updates: Partial<Omit<TelescopeSection, 'id'>>) => void
  reorderSection: (sectionId: string, newSortOrder: number) => void
  toggleSectionCollapse: (id: string) => void

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
      // Hydration state
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Initial state
      telescopes: [],
      sections: [],
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

      getTelescopesBySection: () => {
        const { telescopes, sections } = get()
        const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder)

        // Consistent sort function - by sortOrder if defined, otherwise by id
        const sortTelescopes = (a: TelescopeInfo, b: TelescopeInfo) => {
          const orderA = a.sortOrder ?? Infinity
          const orderB = b.sortOrder ?? Infinity
          if (orderA !== orderB) return orderA - orderB
          return a.id.localeCompare(b.id)
        }

        // Group telescopes by section
        const result: { section: TelescopeSection | null; telescopes: TelescopeInfo[] }[] = []

        // First, add unsectioned telescopes
        const unsectioned = telescopes
          .filter(t => !t.sectionId)
          .sort(sortTelescopes)
        if (unsectioned.length > 0) {
          result.push({ section: null, telescopes: unsectioned })
        }

        // Then add each section with its telescopes
        for (const section of sortedSections) {
          const sectionTelescopes = telescopes
            .filter(t => t.sectionId === section.id)
            .sort(sortTelescopes)
          result.push({ section, telescopes: sectionTelescopes })
        }

        return result
      },

      // Telescope actions
      setTelescopes: (telescopes) => set({ telescopes }),

      mergeTelescopes: (newTelescopes) => set((state) => {
        // Merge new telescopes with existing ones
        // - Update existing telescopes with new info (but preserve status)
        // - Add new telescopes that don't exist
        // - Keep existing telescopes that weren't in the new list (manually added ones)
        const merged = [...state.telescopes]
        const newSettings = { ...state.telescopeSettings }

        for (const newTelescope of newTelescopes) {
          const existingIndex = merged.findIndex(t => t.id === newTelescope.id)

          if (existingIndex >= 0) {
            // Update existing telescope but preserve user-customized fields
            const existing = merged[existingIndex]
            merged[existingIndex] = {
              ...newTelescope,
              // Preserve these user-customized fields from existing
              status: existing.status,
              error: existing.error,
              friendlyName: existing.friendlyName,
              sectionId: existing.sectionId,
              sortOrder: existing.sortOrder,
            }
          } else {
            // Add new telescope
            merged.push(newTelescope)
            // Initialize settings for new telescope
            newSettings[newTelescope.id] = DEFAULT_SETTINGS
          }
        }

        return {
          telescopes: merged,
          telescopeSettings: newSettings,
        }
      }),

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

      reorderTelescope: (telescopeId, newSectionId, newSortOrder) => set((state) => ({
        telescopes: state.telescopes.map(t =>
          t.id === telescopeId
            ? { ...t, sectionId: newSectionId ?? undefined, sortOrder: newSortOrder }
            : t
        )
      })),

      swapTelescopeOrder: (telescopeId1, order1, telescopeId2, order2) => set((state) => ({
        telescopes: state.telescopes.map(t => {
          if (t.id === telescopeId1) return { ...t, sortOrder: order1 }
          if (t.id === telescopeId2) return { ...t, sortOrder: order2 }
          return t
        })
      })),

      // Section actions
      addSection: (name) => set((state) => {
        const maxOrder = Math.max(0, ...state.sections.map(s => s.sortOrder))
        return {
          sections: [
            ...state.sections,
            {
              id: `section-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name,
              sortOrder: maxOrder + 1,
              collapsed: false,
            }
          ]
        }
      }),

      removeSection: (id) => set((state) => ({
        // Remove section and move its telescopes to unsectioned
        sections: state.sections.filter(s => s.id !== id),
        telescopes: state.telescopes.map(t =>
          t.sectionId === id ? { ...t, sectionId: undefined } : t
        )
      })),

      updateSection: (id, updates) => set((state) => ({
        sections: state.sections.map(s =>
          s.id === id ? { ...s, ...updates } : s
        )
      })),

      reorderSection: (sectionId, newSortOrder) => set((state) => ({
        sections: state.sections.map(s =>
          s.id === sectionId ? { ...s, sortOrder: newSortOrder } : s
        )
      })),

      toggleSectionCollapse: (id) => set((state) => ({
        sections: state.sections.map(s =>
          s.id === id ? { ...s, collapsed: !s.collapsed } : s
        )
      })),

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
        // Only persist these fields - exclude status since backend state is lost on restart
        telescopes: state.telescopes.map(t => ({
          ...t,
          status: 'disconnected' as const,  // Always persist as disconnected
          error: undefined,
        })),
        sections: state.sections,
        currentTelescopeId: state.currentTelescopeId,
        telescopeSettings: state.telescopeSettings,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
