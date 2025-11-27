import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeId } from '../themes'

export interface PipPosition {
  x: number
  y: number
}

export type ActiveTab = 'telescope' | 'catalog' | 'imaging' | 'planning'
export type SidebarPanel = 'controls' | 'info' | 'settings' | 'activity' | null

interface UIStore {
  // Theme
  theme: ThemeId
  setTheme: (theme: ThemeId) => void

  // Active tab
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void

  // Sidebar
  sidebarOpen: boolean
  sidebarPanel: SidebarPanel
  setSidebarOpen: (open: boolean) => void
  setSidebarPanel: (panel: SidebarPanel) => void
  toggleSidebar: () => void

  // Picture in Picture
  showPiP: boolean
  pipPosition: PipPosition
  pipTelescopeId: string | null
  setShowPiP: (show: boolean) => void
  setPipPosition: (position: PipPosition) => void
  setPipTelescopeId: (id: string | null) => void
  togglePiP: () => void

  // Modals
  showKeyboardHelp: boolean
  showSettings: boolean
  showTelescopeManager: boolean
  showEquipmentManager: boolean
  showCelestialSearch: boolean
  setShowKeyboardHelp: (show: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowTelescopeManager: (show: boolean) => void
  setShowEquipmentManager: (show: boolean) => void
  setShowCelestialSearch: (show: boolean) => void

  // Controls
  isControlsCollapsed: boolean
  setIsControlsCollapsed: (collapsed: boolean) => void
  toggleControls: () => void

  // Streaming settings
  streamingEnabled: boolean
  streamingQuality: 'low' | 'medium' | 'high'
  setStreamingEnabled: (enabled: boolean) => void
  setStreamingQuality: (quality: 'low' | 'medium' | 'high') => void

  // Toast notifications queue (managed separately, this is just for persistence toggle)
  toastsEnabled: boolean
  setToastsEnabled: (enabled: boolean) => void

  // Fullscreen
  isFullscreen: boolean
  setIsFullscreen: (fullscreen: boolean) => void
  toggleFullscreen: () => void

  // Quick actions
  closeAllModals: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      // Active tab
      activeTab: 'telescope',
      setActiveTab: (activeTab) => set({ activeTab }),

      // Sidebar
      sidebarOpen: true,
      sidebarPanel: 'controls',
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarPanel: (sidebarPanel) => set({ sidebarPanel }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      // Picture in Picture
      showPiP: false,
      pipPosition: { x: 100, y: 100 },
      pipTelescopeId: null,
      setShowPiP: (showPiP) => set({ showPiP }),
      setPipPosition: (pipPosition) => set({ pipPosition }),
      setPipTelescopeId: (pipTelescopeId) => set({ pipTelescopeId }),
      togglePiP: () => set((state) => ({ showPiP: !state.showPiP })),

      // Modals
      showKeyboardHelp: false,
      showSettings: false,
      showTelescopeManager: false,
      showEquipmentManager: false,
      showCelestialSearch: false,
      setShowKeyboardHelp: (showKeyboardHelp) => set({ showKeyboardHelp }),
      setShowSettings: (showSettings) => set({ showSettings }),
      setShowTelescopeManager: (showTelescopeManager) => set({ showTelescopeManager }),
      setShowEquipmentManager: (showEquipmentManager) => set({ showEquipmentManager }),
      setShowCelestialSearch: (showCelestialSearch) => set({ showCelestialSearch }),

      // Controls
      isControlsCollapsed: false,
      setIsControlsCollapsed: (isControlsCollapsed) => set({ isControlsCollapsed }),
      toggleControls: () => set((state) => ({ isControlsCollapsed: !state.isControlsCollapsed })),

      // Streaming settings
      streamingEnabled: true,
      streamingQuality: 'medium',
      setStreamingEnabled: (streamingEnabled) => set({ streamingEnabled }),
      setStreamingQuality: (streamingQuality) => set({ streamingQuality }),

      // Toasts
      toastsEnabled: true,
      setToastsEnabled: (toastsEnabled) => set({ toastsEnabled }),

      // Fullscreen
      isFullscreen: false,
      setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
      toggleFullscreen: () => {
        const current = get().isFullscreen
        if (!current) {
          document.documentElement.requestFullscreen?.()
        } else {
          document.exitFullscreen?.()
        }
        set({ isFullscreen: !current })
      },

      // Quick actions
      closeAllModals: () => set({
        showKeyboardHelp: false,
        showSettings: false,
        showTelescopeManager: false,
        showEquipmentManager: false,
        showCelestialSearch: false,
      }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        // Only persist these UI preferences
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        isControlsCollapsed: state.isControlsCollapsed,
        streamingEnabled: state.streamingEnabled,
        streamingQuality: state.streamingQuality,
        toastsEnabled: state.toastsEnabled,
        pipPosition: state.pipPosition,
      }),
    }
  )
)
