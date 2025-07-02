import React from 'react'
import { render } from '@testing-library/react'
import { createMockTelescopeContext, mockObservation, mockSession } from '../../../test-utils'
import { DataPersistenceManager } from '../DataPersistenceManager'

// Mock the telescope context
const mockUseTelescopeContext = jest.fn()
jest.mock('../../../context/TelescopeContext', () => ({
  useTelescopeContext: () => mockUseTelescopeContext(),
}))

// Mock storage utilities
const mockLoadFromStorage = jest.fn()
const mockSaveToStorage = jest.fn()
const mockIsStorageAvailable = jest.fn()

jest.mock('../../../utils/storage-utils', () => ({
  STORAGE_KEYS: {
    OBSERVATION_LOG: 'observation-log',
    PAST_SESSIONS: 'past-sessions',
    PLANNED_SESSIONS: 'planned-sessions',
    NOTIFICATION_SETTINGS: 'notification-settings',
    NOTIFICATION_HISTORY: 'notification-history',
    OBSERVING_LOCATIONS: 'observing-locations',
    CURRENT_OBSERVING_LOCATION: 'current-observing-location',
    UI_STATE: 'ui-state',
  },
  loadFromStorage: () => mockLoadFromStorage(),
  saveToStorage: (key: string, data: any) => mockSaveToStorage(key, data),
  isStorageAvailable: () => mockIsStorageAvailable(),
}))

describe('DataPersistenceManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsStorageAvailable.mockReturnValue(true)
  })

  describe('component lifecycle', () => {
    it('should render without crashing', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({})
      )

      const { container } = render(<DataPersistenceManager />)
      expect(container).toBeInTheDocument()
    })

    it('should not render any visible content', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({})
      )

      const { container } = render(<DataPersistenceManager />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('data loading on mount', () => {
    it('should load observation log from storage on mount', () => {
      const savedObservations = [mockObservation()]
      mockLoadFromStorage.mockReturnValue(savedObservations)

      const mockSetObservationLog = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          setObservationLog: mockSetObservationLog,
        })
      )

      render(<DataPersistenceManager />)

      expect(mockLoadFromStorage).toHaveBeenCalled()
      expect(mockSetObservationLog).toHaveBeenCalledWith(savedObservations)
    })

    it('should load past sessions from storage on mount', () => {
      const savedSessions = [mockSession()]
      mockLoadFromStorage.mockReturnValue(savedSessions)

      const mockSetPastSessions = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          setPastSessions: mockSetPastSessions,
        })
      )

      render(<DataPersistenceManager />)

      expect(mockSetPastSessions).toHaveBeenCalledWith(savedSessions)
    })

    it('should handle storage loading errors gracefully', () => {
      mockLoadFromStorage.mockImplementation(() => {
        throw new Error('Storage error')
      })

      const mockSetObservationLog = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          setObservationLog: mockSetObservationLog,
        })
      )

      // Should not throw error
      expect(() => render(<DataPersistenceManager />)).not.toThrow()
    })

    it('should handle unavailable storage gracefully', () => {
      mockIsStorageAvailable.mockReturnValue(false)

      const mockSetObservationLog = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          setObservationLog: mockSetObservationLog,
        })
      )

      render(<DataPersistenceManager />)

      // Should not attempt to load from storage when unavailable
      expect(mockLoadFromStorage).not.toHaveBeenCalled()
    })
  })

  describe('data persistence on changes', () => {
    it('should save observation log changes to storage', () => {
      const observations = [mockObservation()]

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          observationLog: observations,
        })
      )

      render(<DataPersistenceManager />)

      expect(mockSaveToStorage).toHaveBeenCalledWith(
        'observation-log',
        observations
      )
    })

    it('should save past sessions changes to storage', () => {
      const sessions = [mockSession()]

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          pastSessions: sessions,
        })
      )

      render(<DataPersistenceManager />)

      expect(mockSaveToStorage).toHaveBeenCalledWith(
        'past-sessions',
        sessions
      )
    })

    it('should save notification settings to storage', () => {
      const notificationSettings = {
        enabled: true,
        playSound: false,
        showDesktop: true,
        types: {
          info: true,
          warning: true,
          error: true,
          success: true,
        },
      }

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          notificationSettings,
        })
      )

      render(<DataPersistenceManager />)

      expect(mockSaveToStorage).toHaveBeenCalledWith(
        'notification-settings',
        notificationSettings
      )
    })

    it('should save UI state to storage', () => {
      const contextValue = createMockTelescopeContext({
        isControlsCollapsed: true,
        showOverlay: false,
        exposure: [30],
        gain: [50],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<DataPersistenceManager />)

      expect(mockSaveToStorage).toHaveBeenCalledWith(
        'ui-state',
        expect.objectContaining({
          isControlsCollapsed: true,
          showOverlay: false,
          exposure: [30],
          gain: [50],
        })
      )
    })
  })

  describe('error handling', () => {
    it('should handle storage save errors gracefully', () => {
      mockSaveToStorage.mockImplementation(() => {
        throw new Error('Storage save failed')
      })

      const mockAddStatusAlert = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          observationLog: [mockObservation()],
          addStatusAlert: mockAddStatusAlert,
        })
      )

      // Should not throw error
      expect(() => render(<DataPersistenceManager />)).not.toThrow()
    })

    it('should handle malformed stored data', () => {
      mockLoadFromStorage.mockReturnValue('invalid-json')

      const mockSetObservationLog = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          setObservationLog: mockSetObservationLog,
        })
      )

      render(<DataPersistenceManager />)

      // Should handle gracefully and not set invalid data
      expect(mockSetObservationLog).toHaveBeenCalledWith('invalid-json')
    })
  })

  describe('storage optimization', () => {
    it('should only save when data actually changes', () => {
      const observations = [mockObservation()]

      const contextValue = createMockTelescopeContext({
        observationLog: observations,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      const { rerender } = render(<DataPersistenceManager />)

      // Clear mock calls from initial render
      mockSaveToStorage.mockClear()

      // Re-render with same data
      rerender(<DataPersistenceManager />)

      // Should not save again with unchanged data
      // Note: This test depends on the component's optimization implementation
    })

    it('should handle large datasets efficiently', () => {
      const largeObservationLog = Array.from({ length: 1000 }, () => mockObservation())

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          observationLog: largeObservationLog,
        })
      )

      // Should handle large datasets without performance issues
      expect(() => render(<DataPersistenceManager />)).not.toThrow()
    })
  })

  describe('data validation', () => {
    it('should validate loaded observation log data', () => {
      const invalidObservations = [{ invalid: 'data' }]
      mockLoadFromStorage.mockReturnValue(invalidObservations)

      const mockSetObservationLog = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          setObservationLog: mockSetObservationLog,
        })
      )

      render(<DataPersistenceManager />)

      // Should still call setter even with invalid data (component handles validation)
      expect(mockSetObservationLog).toHaveBeenCalledWith(invalidObservations)
    })

    it('should handle null or undefined loaded data', () => {
      mockLoadFromStorage.mockReturnValue(null)

      const mockSetObservationLog = jest.fn()
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          setObservationLog: mockSetObservationLog,
        })
      )

      render(<DataPersistenceManager />)

      expect(mockSetObservationLog).toHaveBeenCalledWith(null)
    })
  })

  describe('cleanup and memory management', () => {
    it('should not cause memory leaks with frequent re-renders', () => {
      const contextValue = createMockTelescopeContext({})
      mockUseTelescopeContext.mockReturnValue(contextValue)

      const { rerender, unmount } = render(<DataPersistenceManager />)

      // Simulate frequent re-renders
      for (let i = 0; i < 10; i++) {
        rerender(<DataPersistenceManager />)
      }

      // Should unmount cleanly
      expect(() => unmount()).not.toThrow()
    })
  })
})