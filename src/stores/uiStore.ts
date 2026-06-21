import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeId } from '../themes'

export interface PipPosition {
  x: number
  y: number
}

export type ActiveTab = 'telescope' | 'catalog' | 'imaging' | 'planning' | 'schedule'
export type SidebarPanel = 'controls' | 'info' | 'settings' | 'activity' | null

export type AllskyCameraType = 'teamallsky' | 'indi' | 'custom'

export interface AllskySettings {
  cameraType: AllskyCameraType
  hostname: string
  customUrl: string
  defaultSize: 'small' | 'medium' | 'large'
  autoShow: boolean
  showStatusByDefault: boolean
  minimizedByDefault: boolean
}

export const defaultAllskySettings: AllskySettings = {
  cameraType: 'custom',
  hostname: '',
  customUrl: '',
  defaultSize: 'medium',
  autoShow: false,
  showStatusByDefault: false,
  minimizedByDefault: true,
}

interface UIStore {
  // Hydration state
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
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

  // Allsky Panel
  showAllskyPanel: boolean
  setShowAllskyPanel: (show: boolean) => void

  // Allsky camera config (persisted)
  allsky: AllskySettings
  setAllsky: (partial: Partial<AllskySettings>) => void

  // Telescope Status Overlay
  showTelescopeStatus: boolean
  setShowTelescopeStatus: (show: boolean) => void

  // Telescope Controls Overlay
  showTelescopeControls: boolean
  setShowTelescopeControls: (show: boolean) => void

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

  // Manual movement tracking (for fast coordinate polling)
  isManuallyMoving: boolean
  setIsManuallyMoving: (moving: boolean) => void

  // Plate solve settings
  plateSolveApiKey: string
  setPlateSolveApiKey: (key: string) => void

  // Additional dialogs
  showImageSaveDialog: boolean
  showPlateSolveDialog: boolean
  setShowImageSaveDialog: (show: boolean) => void
  setShowPlateSolveDialog: (show: boolean) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Hydration state
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

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

      // Allsky Panel
      showAllskyPanel: false,
      setShowAllskyPanel: (showAllskyPanel) => set({ showAllskyPanel }),

      // Allsky camera config
      allsky: defaultAllskySettings,
      setAllsky: (partial) => set((state) => ({ allsky: { ...state.allsky, ...partial } })),

      // Telescope Status Overlay
      showTelescopeStatus: true,
      setShowTelescopeStatus: (showTelescopeStatus) => set({ showTelescopeStatus }),

      // Telescope Controls Overlay
      showTelescopeControls: false,
      setShowTelescopeControls: (showTelescopeControls) => set({ showTelescopeControls }),

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

      // Manual movement tracking
      isManuallyMoving: false,
      setIsManuallyMoving: (isManuallyMoving) => set({ isManuallyMoving }),

      // Plate solve settings
      plateSolveApiKey: '',
      setPlateSolveApiKey: (plateSolveApiKey) => set({ plateSolveApiKey }),

      // Additional dialogs
      showImageSaveDialog: false,
      showPlateSolveDialog: false,
      setShowImageSaveDialog: (showImageSaveDialog) => set({ showImageSaveDialog }),
      setShowPlateSolveDialog: (showPlateSolveDialog) => set({ showPlateSolveDialog }),
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
        // Persist window visibility states
        showPiP: state.showPiP,
        showTelescopeStatus: state.showTelescopeStatus,
        showTelescopeControls: state.showTelescopeControls,
        showAllskyPanel: state.showAllskyPanel,
        // Allsky camera config
        allsky: state.allsky,
        // Plate solve settings
        plateSolveApiKey: state.plateSolveApiKey,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
