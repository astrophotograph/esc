import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../uiStore'

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store state
    useUIStore.setState({
      theme: 'dark',
      activeTab: 'telescope',
      sidebarOpen: true,
      sidebarPanel: 'controls',
      showPiP: false,
      pipPosition: { x: 100, y: 100 },
      pipTelescopeId: null,
      showKeyboardHelp: false,
      showSettings: false,
      showTelescopeManager: false,
      showEquipmentManager: false,
      showCelestialSearch: false,
      isControlsCollapsed: false,
      streamingEnabled: true,
      streamingQuality: 'medium',
      toastsEnabled: true,
      isFullscreen: false,
    })
  })

  describe('theme management', () => {
    it('should set theme', () => {
      useUIStore.getState().setTheme('night-vision')
      expect(useUIStore.getState().theme).toBe('night-vision')
    })
  })

  describe('tab management', () => {
    it('should set active tab', () => {
      useUIStore.getState().setActiveTab('catalog')
      expect(useUIStore.getState().activeTab).toBe('catalog')
    })
  })

  describe('sidebar management', () => {
    it('should toggle sidebar', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true)
      useUIStore.getState().toggleSidebar()
      expect(useUIStore.getState().sidebarOpen).toBe(false)
      useUIStore.getState().toggleSidebar()
      expect(useUIStore.getState().sidebarOpen).toBe(true)
    })

    it('should set sidebar panel', () => {
      useUIStore.getState().setSidebarPanel('settings')
      expect(useUIStore.getState().sidebarPanel).toBe('settings')
    })
  })

  describe('PiP management', () => {
    it('should toggle PiP', () => {
      expect(useUIStore.getState().showPiP).toBe(false)
      useUIStore.getState().togglePiP()
      expect(useUIStore.getState().showPiP).toBe(true)
    })

    it('should set PiP position', () => {
      useUIStore.getState().setPipPosition({ x: 200, y: 300 })
      expect(useUIStore.getState().pipPosition).toEqual({ x: 200, y: 300 })
    })

    it('should set PiP telescope ID', () => {
      useUIStore.getState().setPipTelescopeId('telescope-1')
      expect(useUIStore.getState().pipTelescopeId).toBe('telescope-1')
    })
  })

  describe('modal management', () => {
    it('should show keyboard help', () => {
      useUIStore.getState().setShowKeyboardHelp(true)
      expect(useUIStore.getState().showKeyboardHelp).toBe(true)
    })

    it('should show settings', () => {
      useUIStore.getState().setShowSettings(true)
      expect(useUIStore.getState().showSettings).toBe(true)
    })

    it('should close all modals', () => {
      useUIStore.getState().setShowKeyboardHelp(true)
      useUIStore.getState().setShowSettings(true)
      useUIStore.getState().setShowTelescopeManager(true)
      useUIStore.getState().setShowEquipmentManager(true)
      useUIStore.getState().setShowCelestialSearch(true)

      useUIStore.getState().closeAllModals()

      const state = useUIStore.getState()
      expect(state.showKeyboardHelp).toBe(false)
      expect(state.showSettings).toBe(false)
      expect(state.showTelescopeManager).toBe(false)
      expect(state.showEquipmentManager).toBe(false)
      expect(state.showCelestialSearch).toBe(false)
    })
  })

  describe('controls management', () => {
    it('should toggle controls', () => {
      expect(useUIStore.getState().isControlsCollapsed).toBe(false)
      useUIStore.getState().toggleControls()
      expect(useUIStore.getState().isControlsCollapsed).toBe(true)
    })
  })

  describe('streaming settings', () => {
    it('should set streaming enabled', () => {
      useUIStore.getState().setStreamingEnabled(false)
      expect(useUIStore.getState().streamingEnabled).toBe(false)
    })

    it('should set streaming quality', () => {
      useUIStore.getState().setStreamingQuality('high')
      expect(useUIStore.getState().streamingQuality).toBe('high')
    })
  })

  describe('toasts', () => {
    it('should toggle toasts', () => {
      useUIStore.getState().setToastsEnabled(false)
      expect(useUIStore.getState().toastsEnabled).toBe(false)
    })
  })
})
