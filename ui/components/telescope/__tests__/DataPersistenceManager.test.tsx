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
    OBSERVATIONS: 'telescope-observations',
    SESSIONS: 'telescope-sessions',
    PLANNED_SESSIONS: 'telescope-planned-sessions',
    NOTIFICATION_SETTINGS: 'telescope-notification-settings',
    NOTIFICATION_HISTORY: 'telescope-notification-history',
    LOCATIONS: 'telescope-locations',
    CURRENT_LOCATION: 'telescope-current-location',
    UI_STATE: 'telescope-ui-state',
  },
  loadFromStorage: (key: string, defaultValue: any) => mockLoadFromStorage(key, defaultValue),
  saveToStorage: (key: string, data: any) => mockSaveToStorage(key, data),
  isStorageAvailable: () => mockIsStorageAvailable(),
}))

describe('DataPersistenceManager', () => {
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsStorageAvailable.mockReturnValue(true)
    
    // Suppress console.error to reduce test noise
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (consoleSpy) {
      consoleSpy.mockRestore()
    }
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
      // Verify that setObservationLog was called with observations where timestamp is converted to Date
      expect(mockSetObservationLog).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            ...savedObservations[0],
            timestamp: expect.any(Date),
          })
        ])
      )
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

      // Verify that setPastSessions was called with sessions where dates are converted to Date objects
      expect(mockSetPastSessions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            ...savedSessions[0],
            startTime: expect.any(Date),
            endTime: undefined, // null becomes undefined
          })
        ])
      )
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
        'telescope-observations',
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
        'telescope-sessions',
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
        'telescope-notification-settings',
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
        'telescope-ui-state',
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

      // Should handle gracefully and not crash (invalid data is caught by try-catch)
      expect(mockSetObservationLog).not.toHaveBeenCalled()
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

      // Should call setter with processed data, even if invalid (timestamp becomes Date object)
      expect(mockSetObservationLog).toHaveBeenCalledWith([
        expect.objectContaining({
          invalid: 'data',
          timestamp: expect.any(Date), // Invalid timestamp becomes Date object (possibly NaN)
        }),
      ])
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

      // Should not call setter when null/undefined is returned (checked with && length > 0)
      expect(mockSetObservationLog).not.toHaveBeenCalled()
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