import { describe, it, expect, beforeEach } from 'vitest'
import { useTelescopeStore } from '../telescopeStore'

describe('telescopeStore', () => {
  beforeEach(() => {
    // Reset store state
    useTelescopeStore.setState({
      telescopes: [],
      currentTelescopeId: null,
      telescopeStatus: {},
      telescopeSettings: {},
      activityLog: [],
      isDiscovering: false,
    })
  })

  describe('telescope management', () => {
    it('should add a telescope', () => {
      const telescope = {
        id: 'test-1',
        host: '192.168.1.100',
        port: 4700,
        name: 'Test Seestar',
        status: 'disconnected' as const,
      }

      useTelescopeStore.getState().addTelescope(telescope)

      const state = useTelescopeStore.getState()
      expect(state.telescopes).toHaveLength(1)
      expect(state.telescopes[0]).toEqual(telescope)
      expect(state.telescopeSettings['test-1']).toBeDefined()
    })

    it('should not add duplicate telescopes', () => {
      const telescope = {
        id: 'test-1',
        host: '192.168.1.100',
        port: 4700,
        name: 'Test Seestar',
        status: 'disconnected' as const,
      }

      useTelescopeStore.getState().addTelescope(telescope)
      useTelescopeStore.getState().addTelescope(telescope)

      const state = useTelescopeStore.getState()
      expect(state.telescopes).toHaveLength(1)
    })

    it('should remove a telescope', () => {
      const telescope = {
        id: 'test-1',
        host: '192.168.1.100',
        port: 4700,
        name: 'Test Seestar',
        status: 'disconnected' as const,
      }

      useTelescopeStore.getState().addTelescope(telescope)
      useTelescopeStore.getState().removeTelescope('test-1')

      const state = useTelescopeStore.getState()
      expect(state.telescopes).toHaveLength(0)
    })

    it('should update telescope properties', () => {
      const telescope = {
        id: 'test-1',
        host: '192.168.1.100',
        port: 4700,
        name: 'Test Seestar',
        status: 'disconnected' as const,
      }

      useTelescopeStore.getState().addTelescope(telescope)
      useTelescopeStore.getState().updateTelescope('test-1', { status: 'connected' })

      const state = useTelescopeStore.getState()
      expect(state.telescopes[0].status).toBe('connected')
    })

    it('should set current telescope', () => {
      const telescope = {
        id: 'test-1',
        host: '192.168.1.100',
        port: 4700,
        name: 'Test Seestar',
        status: 'disconnected' as const,
      }

      useTelescopeStore.getState().addTelescope(telescope)
      useTelescopeStore.getState().setCurrentTelescope('test-1')

      const state = useTelescopeStore.getState()
      expect(state.currentTelescopeId).toBe('test-1')
    })
  })

  describe('telescope status', () => {
    it('should update telescope status', () => {
      useTelescopeStore.getState().updateTelescopeStatus('test-1', {
        ra: 12.5,
        dec: 45.3,
        tracking: true,
      })

      const state = useTelescopeStore.getState()
      expect(state.telescopeStatus['test-1']).toEqual({
        ra: 12.5,
        dec: 45.3,
        tracking: true,
      })
    })

    it('should merge status updates', () => {
      useTelescopeStore.getState().updateTelescopeStatus('test-1', {
        ra: 12.5,
        dec: 45.3,
      })
      useTelescopeStore.getState().updateTelescopeStatus('test-1', {
        tracking: true,
      })

      const state = useTelescopeStore.getState()
      expect(state.telescopeStatus['test-1']).toEqual({
        ra: 12.5,
        dec: 45.3,
        tracking: true,
      })
    })

    it('should clear telescope status', () => {
      useTelescopeStore.getState().updateTelescopeStatus('test-1', {
        ra: 12.5,
        dec: 45.3,
      })
      useTelescopeStore.getState().clearTelescopeStatus('test-1')

      const state = useTelescopeStore.getState()
      expect(state.telescopeStatus['test-1']).toBeUndefined()
    })
  })

  describe('activity log', () => {
    it('should add activity entries', () => {
      useTelescopeStore.getState().addActivity('test-1', 'info', 'Test message')

      const state = useTelescopeStore.getState()
      expect(state.activityLog).toHaveLength(1)
      expect(state.activityLog[0].message).toBe('Test message')
      expect(state.activityLog[0].type).toBe('info')
      expect(state.activityLog[0].telescopeId).toBe('test-1')
    })

    it('should limit activity log to 100 entries', () => {
      for (let i = 0; i < 150; i++) {
        useTelescopeStore.getState().addActivity('test-1', 'info', `Message ${i}`)
      }

      const state = useTelescopeStore.getState()
      expect(state.activityLog).toHaveLength(100)
    })

    it('should clear activity log', () => {
      useTelescopeStore.getState().addActivity('test-1', 'info', 'Test message')
      useTelescopeStore.getState().clearActivityLog()

      const state = useTelescopeStore.getState()
      expect(state.activityLog).toHaveLength(0)
    })
  })

  describe('computed getters', () => {
    it('should get current telescope', () => {
      const telescope = {
        id: 'test-1',
        host: '192.168.1.100',
        port: 4700,
        name: 'Test Seestar',
        status: 'disconnected' as const,
      }

      useTelescopeStore.getState().addTelescope(telescope)
      useTelescopeStore.getState().setCurrentTelescope('test-1')

      const currentTelescope = useTelescopeStore.getState().getCurrentTelescope()
      expect(currentTelescope).toEqual(telescope)
    })

    it('should return undefined when no current telescope', () => {
      const currentTelescope = useTelescopeStore.getState().getCurrentTelescope()
      expect(currentTelescope).toBeUndefined()
    })
  })
})
