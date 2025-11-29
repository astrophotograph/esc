import React from 'react'
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { createMockTelescopeContext, mockTelescope } from '../../test-utils'

// Import components for integration testing
import { Header } from '../../components/telescope/Header'
import { StatusAlerts } from '../../components/telescope/StatusAlerts'
import { CameraView } from '../../components/telescope/CameraView'
import { SessionManagement } from '../../components/telescope/panels/SessionManagement'
import { ObservationLogger } from '../../components/telescope/panels/ObservationLogger'

// Mock API utility functions inline
const mockFetchTelescopes = jest.fn()
const mockConnectToTelescope = jest.fn()
const mockDisconnectFromTelescope = jest.fn()
const mockStartSSEConnection = jest.fn()
const mockStopSSEConnection = jest.fn()

// Mock telescope context
const mockUseTelescopeContext = jest.fn()
jest.mock('../../context/TelescopeContext', () => ({
  useTelescopeContext: () => mockUseTelescopeContext(),
  TelescopeProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="telescope-provider">{children}</div>,
}))

// Mock storage utilities for state persistence
const mockSaveToStorage = jest.fn()
const mockLoadFromStorage = jest.fn()

jest.mock('../../utils/storage-utils', () => ({
  STORAGE_KEYS: {
    TELESCOPE_STATE: 'telescope-state',
    CONNECTION_HISTORY: 'connection-history',
    UI_STATE: 'ui-state',
  },
  loadFromStorage: (key: string, defaultValue: any) => mockLoadFromStorage(key, defaultValue),
  saveToStorage: (key: string, data: any) => mockSaveToStorage(key, data),
  isStorageAvailable: () => true,
}))

// Mock network utility functions inline
const mockPingTelescope = jest.fn((id) => Promise.resolve({ status: 'online', latency: 50 }))
const mockCheckNetworkConnectivity = jest.fn(() => Promise.resolve(true))
const mockGetNetworkInfo = jest.fn(() => ({ ssid: 'TestNetwork', strength: 85 }))

describe('Multi-Telescope Switching Integration Tests', () => {
  const mockTelescope1 = mockTelescope({
    id: 'telescope-1',
    name: 'Seestar S50 #1',
    serial_number: 'SS50001',
    ip_address: '192.168.1.100',
    port: 4700,
  })

  const mockTelescope2 = mockTelescope({
    id: 'telescope-2',
    name: 'Seestar S50 #2',
    serial_number: 'SS50002',
    ip_address: '192.168.1.101',
    port: 4700,
  })

  const mockTelescope3 = mockTelescope({
    id: 'telescope-3',
    name: 'Seestar S30 #1',
    serial_number: 'SS30001',
    ip_address: '192.168.1.102',
    port: 4700,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadFromStorage.mockReturnValue({})
    mockFetchTelescopes.mockResolvedValue([mockTelescope1, mockTelescope2, mockTelescope3])
  })

  describe('Telescope Discovery and Selection', () => {
    it('should discover multiple telescopes and allow selection', async () => {
      const mockSetCurrentTelescope = jest.fn()
      const mockRefreshTelescopes = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2, mockTelescope3],
        currentTelescope: null,
        setCurrentTelescope: mockSetCurrentTelescope,
        refreshTelescopes: mockRefreshTelescopes,
        isLoading: false,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      // Should show telescope count
      expect(screen.getByText('3')).toBeInTheDocument() // Telescope count
      
      // Open telescope selector
      const telescopeSelector = screen.getByRole('button', { name: /select telescope/i })
      fireEvent.click(telescopeSelector)

      // Should show all discovered telescopes
      expect(screen.getByText('Seestar S50 #1')).toBeInTheDocument()
      expect(screen.getByText('Seestar S50 #2')).toBeInTheDocument()
      expect(screen.getByText('Seestar S30 #1')).toBeInTheDocument()

      // Select first telescope
      const firstTelescope = screen.getByText('Seestar S50 #1')
      fireEvent.click(firstTelescope)

      expect(mockSetCurrentTelescope).toHaveBeenCalledWith(mockTelescope1)
    })

    it('should handle telescope discovery failures gracefully', async () => {
      mockFetchTelescopes.mockRejectedValue(new Error('Network discovery failed'))

      const contextValue = createMockTelescopeContext({
        telescopes: [],
        currentTelescope: null,
        isLoading: false,
        error: 'Network discovery failed',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<StatusAlerts />)

      expect(screen.getByText(/network discovery failed/i)).toBeInTheDocument()
    })

    it('should retry discovery automatically after failure', async () => {
      const mockRetryDiscovery = jest.fn()

      // First call fails, second succeeds
      mockFetchTelescopes
        .mockRejectedValueOnce(new Error('Discovery failed'))
        .mockResolvedValueOnce([mockTelescope1])

      const contextValue = createMockTelescopeContext({
        telescopes: [],
        currentTelescope: null,
        retryDiscovery: mockRetryDiscovery,
        isLoading: false,
        error: 'Discovery failed',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<StatusAlerts />)

      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      expect(mockRetryDiscovery).toHaveBeenCalled()

      // Update context to show successful retry
      const successContextValue = {
        ...contextValue,
        telescopes: [mockTelescope1],
        error: null,
      }

      mockUseTelescopeContext.mockReturnValue(successContextValue)

      const { rerender } = render(<StatusAlerts />)
      rerender(<StatusAlerts />)

      expect(screen.queryByText(/discovery failed/i)).not.toBeInTheDocument()
    })
  })

  describe('State Isolation Between Telescopes', () => {
    it('should maintain separate state for each telescope', async () => {
      const mockSwitchTelescope = jest.fn()

      // Initial state with telescope 1
      const telescope1State = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        switchTelescope: mockSwitchTelescope,
        focusPosition: [1500],
        exposure: [30],
        gain: [50],
        activeSession: {
          id: 'session-1',
          name: 'Session with T1',
          startTime: new Date().toISOString(),
          endTime: null,
          observations: [],
          totalObservingTime: 3600,
          equipment: [],
          notes: 'Session on telescope 1',
        },
        observationLog: [
          {
            id: 'obs-1',
            timestamp: new Date().toISOString(),
            target: 'Andromeda Galaxy',
            notes: 'Observation from telescope 1',
            rating: 4,
            telescopeId: 'telescope-1',
          },
        ],
      })

      mockUseTelescopeContext.mockReturnValue(telescope1State)

      render(<SessionManagement />)
      
      // Verify telescope 1 state
      expect(screen.getByText('Session with T1')).toBeInTheDocument()
      expect(screen.getByText('Session on telescope 1')).toBeInTheDocument()

      // Switch to telescope 2
      fireEvent.click(screen.getByRole('button', { name: /switch telescope/i }))
      
      const telescope2Option = screen.getByText('Seestar S50 #2')
      fireEvent.click(telescope2Option)

      expect(mockSwitchTelescope).toHaveBeenCalledWith('telescope-2')

      // Update context to telescope 2 state
      const telescope2State = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope2,
        switchTelescope: mockSwitchTelescope,
        focusPosition: [2500], // Different from telescope 1
        exposure: [60], // Different from telescope 1
        gain: [75], // Different from telescope 1
        activeSession: null, // No active session on telescope 2
        observationLog: [], // Empty log for telescope 2
      })

      mockUseTelescopeContext.mockReturnValue(telescope2State)

      const { rerender } = render(<SessionManagement />)
      rerender(<SessionManagement />)

      // Verify telescope 2 has different state
      expect(screen.queryByText('Session with T1')).not.toBeInTheDocument()
      expect(screen.getByText(/no active session/i)).toBeInTheDocument()
    })

    it('should preserve camera settings per telescope', () => {
      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        focusPosition: [1500],
        exposure: [30],
        gain: [50],
        brightness: [100],
        contrast: [80],
        telescopeSettings: {
          'telescope-1': {
            focusPosition: [1500],
            exposure: [30],
            gain: [50],
            brightness: [100],
            contrast: [80],
          },
          'telescope-2': {
            focusPosition: [2000],
            exposure: [45],
            gain: [60],
            brightness: [110],
            contrast: [85],
          },
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<CameraView />)

      // Verify telescope 1 settings are displayed
      expect(screen.getByDisplayValue('30')).toBeInTheDocument() // Exposure
      expect(screen.getByDisplayValue('50')).toBeInTheDocument() // Gain
    })

    it('should isolate observation logs between telescopes', () => {
      const telescope1Observations = [
        {
          id: 'obs-1',
          timestamp: '2024-01-01T20:00:00Z',
          target: 'Andromeda Galaxy',
          notes: 'From telescope 1',
          rating: 4,
          telescopeId: 'telescope-1',
        },
      ]

      const telescope2Observations = [
        {
          id: 'obs-2',
          timestamp: '2024-01-01T21:00:00Z',
          target: 'Orion Nebula',
          notes: 'From telescope 2',
          rating: 5,
          telescopeId: 'telescope-2',
        },
      ]

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        observationLog: telescope1Observations,
        allObservations: [...telescope1Observations, ...telescope2Observations],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<ObservationLogger />)

      // Should only show observations from current telescope
      expect(screen.getByText('From telescope 1')).toBeInTheDocument()
      expect(screen.queryByText('From telescope 2')).not.toBeInTheDocument()
    })
  })

  describe('Connection Management', () => {
    it('should handle connection switching between telescopes', async () => {
      const mockConnectTelescope = jest.fn()
      const mockDisconnectTelescope = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        connectTelescope: mockConnectTelescope,
        disconnectTelescope: mockDisconnectTelescope,
        connectionStatus: 'connected',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      // Switch to telescope 2
      const telescopeSelector = screen.getByRole('button', { name: /seestar s50 #1/i })
      fireEvent.click(telescopeSelector)

      const telescope2Option = screen.getByText('Seestar S50 #2')
      fireEvent.click(telescope2Option)

      // Should disconnect from telescope 1 and connect to telescope 2
      expect(mockDisconnectTelescope).toHaveBeenCalledWith('telescope-1')
      expect(mockConnectTelescope).toHaveBeenCalledWith('telescope-2')
    })

    it('should handle connection failures during switching', async () => {
      const mockConnectTelescope = jest.fn().mockRejectedValue(new Error('Connection failed'))
      const mockAddStatusAlert = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        connectTelescope: mockConnectTelescope,
        addStatusAlert: mockAddStatusAlert,
        connectionStatus: 'disconnected',
        error: 'Connection failed',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<StatusAlerts />)

      expect(screen.getByText(/connection failed/i)).toBeInTheDocument()
      expect(mockAddStatusAlert).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('Connection failed'),
      }))
    })

    it('should maintain connection health monitoring for all telescopes', async () => {
      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2, mockTelescope3],
        currentTelescope: mockTelescope1,
        telescopeHealth: {
          'telescope-1': { status: 'healthy', lastPing: Date.now(), latency: 45 },
          'telescope-2': { status: 'warning', lastPing: Date.now() - 30000, latency: 150 },
          'telescope-3': { status: 'offline', lastPing: Date.now() - 300000, latency: null },
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      // Open telescope selector to see health status
      const telescopeSelector = screen.getByRole('button', { name: /select telescope/i })
      fireEvent.click(telescopeSelector)

      // Should show health indicators
      expect(screen.getByText(/healthy/i)).toBeInTheDocument() // Telescope 1
      expect(screen.getByText(/warning/i)).toBeInTheDocument() // Telescope 2
      expect(screen.getByText(/offline/i)).toBeInTheDocument() // Telescope 3
    })
  })

  describe('Connection Recovery Scenarios', () => {
    it('should handle network interruptions during multi-telescope operation', async () => {
      const mockReconnectTelescope = jest.fn()
      const mockCheckNetworkStatus = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        reconnectTelescope: mockReconnectTelescope,
        checkNetworkStatus: mockCheckNetworkStatus,
        connectionStatus: 'reconnecting',
        networkStatus: 'unstable',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<StatusAlerts />)

      expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
      expect(screen.getByText(/unstable network/i)).toBeInTheDocument()

      // Should attempt automatic reconnection
      await waitFor(() => {
        expect(mockReconnectTelescope).toHaveBeenCalledWith('telescope-1')
      })
    })

    it('should recover telescope sessions after reconnection', async () => {
      const mockRestoreSession = jest.fn()

      // Simulate telescope reconnection with active session
      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1],
        currentTelescope: mockTelescope1,
        restoreSession: mockRestoreSession,
        connectionStatus: 'connected',
        activeSession: {
          id: 'session-recovery',
          name: 'Recovered Session',
          startTime: new Date(Date.now() - 3600000).toISOString(), // Started 1 hour ago
          endTime: null,
          observations: [],
          totalObservingTime: 3600,
          equipment: [],
          notes: 'Session interrupted by connection loss',
          recovered: true,
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<SessionManagement />)

      expect(screen.getByText('Recovered Session')).toBeInTheDocument()
      expect(screen.getByText(/session interrupted/i)).toBeInTheDocument()
      expect(mockRestoreSession).toHaveBeenCalled()
    })

    it('should handle telescope IP address changes', async () => {
      const mockUpdateTelescopeInfo = jest.fn()
      const mockRediscoverTelescopes = jest.fn()

      // Telescope 1 changes IP address
      const updatedTelescope1 = {
        ...mockTelescope1,
        ip_address: '192.168.1.105', // Changed IP
      }

      const contextValue = createMockTelescopeContext({
        telescopes: [updatedTelescope1, mockTelescope2],
        currentTelescope: updatedTelescope1,
        updateTelescopeInfo: mockUpdateTelescopeInfo,
        rediscoverTelescopes: mockRediscoverTelescopes,
        connectionStatus: 'connected',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      // Should update telescope info when IP changes
      expect(mockUpdateTelescopeInfo).toHaveBeenCalledWith('telescope-1', expect.objectContaining({
        ip_address: '192.168.1.105',
      }))
    })

    it('should handle simultaneous connections to multiple telescopes', async () => {
      const mockManageMultipleConnections = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2, mockTelescope3],
        currentTelescope: mockTelescope1,
        connectedTelescopes: ['telescope-1', 'telescope-2'], // Multiple connections
        manageMultipleConnections: mockManageMultipleConnections,
        connectionStatus: 'multi-connected',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      // Should show multiple connection status
      expect(screen.getByText(/2 connected/i)).toBeInTheDocument()
      expect(mockManageMultipleConnections).toHaveBeenCalled()
    })
  })

  describe('Data Persistence Across Switches', () => {
    it('should save telescope-specific state before switching', async () => {
      const mockSaveTelescopeState = jest.fn()
      const mockSwitchTelescope = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        saveTelescopeState: mockSaveTelescopeState,
        switchTelescope: mockSwitchTelescope,
        focusPosition: [1500],
        exposure: [30],
        activeSession: {
          id: 'session-1',
          name: 'Active Session',
          startTime: new Date().toISOString(),
          endTime: null,
          observations: [],
          totalObservingTime: 1800,
          equipment: [],
          notes: '',
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      // Switch telescopes
      const telescopeSelector = screen.getByRole('button', { name: /select telescope/i })
      fireEvent.click(telescopeSelector)

      const telescope2Option = screen.getByText('Seestar S50 #2')
      fireEvent.click(telescope2Option)

      // Should save current state before switching
      expect(mockSaveTelescopeState).toHaveBeenCalledWith('telescope-1', expect.objectContaining({
        focusPosition: [1500],
        exposure: [30],
        activeSession: expect.objectContaining({
          id: 'session-1',
        }),
      }))

      expect(mockSwitchTelescope).toHaveBeenCalledWith('telescope-2')
    })

    it('should restore telescope-specific state after switching', async () => {
      const mockLoadTelescopeState = jest.fn()

      mockLoadFromStorage.mockReturnValue({
        'telescope-2': {
          focusPosition: [2000],
          exposure: [45],
          gain: [65],
          activeSession: {
            id: 'session-2',
            name: 'Restored Session',
            startTime: new Date(Date.now() - 7200000).toISOString(),
            endTime: null,
            observations: [],
            totalObservingTime: 7200,
            equipment: [],
            notes: 'Restored from previous session',
          },
        },
      })

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope2,
        loadTelescopeState: mockLoadTelescopeState,
        focusPosition: [2000], // Restored state
        exposure: [45], // Restored state
        gain: [65], // Restored state
        activeSession: {
          id: 'session-2',
          name: 'Restored Session',
          startTime: new Date(Date.now() - 7200000).toISOString(),
          endTime: null,
          observations: [],
          totalObservingTime: 7200,
          equipment: [],
          notes: 'Restored from previous session',
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<SessionManagement />)

      // Should show restored session
      expect(screen.getByText('Restored Session')).toBeInTheDocument()
      expect(screen.getByText(/restored from previous session/i)).toBeInTheDocument()
      expect(mockLoadTelescopeState).toHaveBeenCalledWith('telescope-2')
    })

    it('should maintain global application state across telescope switches', () => {
      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        globalSettings: {
          theme: 'dark',
          language: 'en',
          notifications: true,
          expertMode: false,
        },
        recentTargets: [
          { name: 'Andromeda Galaxy', type: 'galaxy' },
          { name: 'Orion Nebula', type: 'nebula' },
        ],
        searchHistory: ['M31', 'M42', 'NGC 7000'],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      // Global state should persist regardless of telescope
      expect(screen.getByText(/dark theme/i)).toBeInTheDocument()
      
      // Switch telescopes
      const telescopeSelector = screen.getByRole('button', { name: /select telescope/i })
      fireEvent.click(telescopeSelector)

      const telescope2Option = screen.getByText('Seestar S50 #2')
      fireEvent.click(telescope2Option)

      // Global settings should remain unchanged
      const updatedContextValue = {
        ...contextValue,
        currentTelescope: mockTelescope2,
      }

      mockUseTelescopeContext.mockReturnValue(updatedContextValue)

      const { rerender } = render(<Header />)
      rerender(<Header />)

      expect(screen.getByText(/dark theme/i)).toBeInTheDocument()
    })
  })

  describe('Performance and Resource Management', () => {
    it('should manage memory usage when switching between telescopes', () => {
      const mockCleanupTelescopeResources = jest.fn()
      const mockOptimizeMemoryUsage = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2, mockTelescope3],
        currentTelescope: mockTelescope1,
        cleanupTelescopeResources: mockCleanupTelescopeResources,
        optimizeMemoryUsage: mockOptimizeMemoryUsage,
        memoryUsage: {
          'telescope-1': { heap: 50, images: 120, total: 170 },
          'telescope-2': { heap: 45, images: 0, total: 45 },
          'telescope-3': { heap: 30, images: 0, total: 30 },
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<StatusAlerts />)

      // Should show memory usage warnings if needed
      if (contextValue.memoryUsage['telescope-1'].total > 150) {
        expect(screen.getByText(/high memory usage/i)).toBeInTheDocument()
      }

      // Cleanup should be called when switching
      expect(mockOptimizeMemoryUsage).toHaveBeenCalled()
    })

    it('should handle resource cleanup when telescope becomes unavailable', async () => {
      const mockCleanupDisconnectedTelescope = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1], // Telescope 2 is no longer available
        currentTelescope: mockTelescope1,
        previousTelescope: mockTelescope2, // Was connected to telescope 2
        cleanupDisconnectedTelescope: mockCleanupDisconnectedTelescope,
        connectionStatus: 'switched',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<StatusAlerts />)

      // Should cleanup resources from unavailable telescope
      expect(mockCleanupDisconnectedTelescope).toHaveBeenCalledWith('telescope-2')
    })

    it('should throttle rapid telescope switching', async () => {
      const mockThrottleSwitching = jest.fn()
      let switchCount = 0

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2, mockTelescope3],
        currentTelescope: mockTelescope1,
        switchTelescope: (id: string) => {
          switchCount++
          mockThrottleSwitching(id, switchCount)
        },
        switchingThrottled: switchCount > 3,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<Header />)

      const telescopeSelector = screen.getByRole('button', { name: /select telescope/i })

      // Rapid switching attempts
      fireEvent.click(telescopeSelector)
      fireEvent.click(screen.getByText('Seestar S50 #2'))
      
      fireEvent.click(telescopeSelector)
      fireEvent.click(screen.getByText('Seestar S30 #1'))
      
      fireEvent.click(telescopeSelector)
      fireEvent.click(screen.getByText('Seestar S50 #1'))

      // Should throttle after multiple rapid switches
      expect(mockThrottleSwitching).toHaveBeenCalledTimes(3)
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    it('should handle telescope becoming unavailable during active use', async () => {
      const mockHandleTelescopeUnavailable = jest.fn()

      const contextValue = createMockTelescopeContext({
        telescopes: [], // All telescopes disappeared
        currentTelescope: null,
        previousTelescope: mockTelescope1,
        handleTelescopeUnavailable: mockHandleTelescopeUnavailable,
        connectionStatus: 'lost',
        error: 'Telescope no longer available',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<StatusAlerts />)

      expect(screen.getByText(/telescope no longer available/i)).toBeInTheDocument()
      expect(mockHandleTelescopeUnavailable).toHaveBeenCalledWith('telescope-1')
    })

    it('should handle switching to telescope with different capabilities', () => {
      const basicTelescope = mockTelescope({
        id: 'telescope-basic',
        name: 'Basic Telescope',
        capabilities: {
          hasAutofocus: false,
          hasTracking: false,
          maxExposure: 30,
          filterWheel: false,
        },
      })

      const advancedTelescope = mockTelescope({
        id: 'telescope-advanced',
        name: 'Advanced Telescope',
        capabilities: {
          hasAutofocus: true,
          hasTracking: true,
          maxExposure: 300,
          filterWheel: true,
        },
      })

      const contextValue = createMockTelescopeContext({
        telescopes: [basicTelescope, advancedTelescope],
        currentTelescope: basicTelescope,
        telescopeCapabilities: basicTelescope.capabilities,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<CameraView />)

      // Should hide advanced features for basic telescope
      expect(screen.queryByText(/autofocus/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/tracking/i)).not.toBeInTheDocument()

      // Switch to advanced telescope
      const updatedContextValue = {
        ...contextValue,
        currentTelescope: advancedTelescope,
        telescopeCapabilities: advancedTelescope.capabilities,
      }

      mockUseTelescopeContext.mockReturnValue(updatedContextValue)

      const { rerender } = render(<CameraView />)
      rerender(<CameraView />)

      // Should show advanced features
      expect(screen.getByText(/autofocus/i)).toBeInTheDocument()
      expect(screen.getByText(/tracking/i)).toBeInTheDocument()
    })

    it('should handle corrupted telescope state data', () => {
      mockLoadFromStorage.mockImplementation(() => {
        throw new Error('Corrupted telescope state')
      })

      const contextValue = createMockTelescopeContext({
        telescopes: [mockTelescope1, mockTelescope2],
        currentTelescope: mockTelescope1,
        stateCorrupted: true,
        error: 'Failed to load telescope state',
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      expect(() => render(<Header />)).not.toThrow()

      render(<StatusAlerts />)
      expect(screen.getByText(/failed to load telescope state/i)).toBeInTheDocument()
    })
  })
})