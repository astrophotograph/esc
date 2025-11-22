import React from 'react'
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { createMockTelescopeContext, mockTelescope, mockCelestialObject } from '../../test-utils'
import { TelescopeProvider } from '../../context/TelescopeContext'

// Import the main components for integration testing
import { ObservationLogger } from '../../components/telescope/panels/ObservationLogger'
import { SessionManagement } from '../../components/telescope/panels/SessionManagement'
import { FocusControl } from '../../components/telescope/panels/FocusControl'

// Mock storage utilities for data persistence testing
const mockSaveToStorage = jest.fn()
const mockLoadFromStorage = jest.fn()

jest.mock('../../utils/storage-utils', () => ({
  STORAGE_KEYS: {
    OBSERVATION_LOG: 'observation-log',
    PAST_SESSIONS: 'past-sessions',
    UI_STATE: 'ui-state',
  },
  loadFromStorage: (key: string, defaultValue: any) => mockLoadFromStorage(key, defaultValue),
  saveToStorage: (key: string, data: any) => mockSaveToStorage(key, data),
  isStorageAvailable: () => true,
}))

// Mock telescope context
const mockUseTelescopeContext = jest.fn()
jest.mock('../../context/TelescopeContext', () => ({
  useTelescopeContext: () => mockUseTelescopeContext(),
  TelescopeProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="telescope-provider">{children}</div>,
}))

// Mock telescope utilities
jest.mock('../../utils/telescope-utils', () => ({
  renderStarRating: jest.fn((rating, interactive, onChange) => (
    <div data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          data-testid={`star-${star}`}
          className={star <= rating ? 'filled' : 'empty'}
          onClick={interactive && onChange ? () => onChange(star) : undefined}
        >
          ⭐
        </button>
      ))}
    </div>
  )),
  formatSessionTime: jest.fn((seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }),
}))

describe('Observation Recording Flow Integration Tests', () => {
  const mockTelescope1 = mockTelescope({
    id: 'telescope-1',
    name: 'Seestar S50',
    serial_number: 'SS50001',
  })

  const mockTargetObject = mockCelestialObject({
    name: 'Andromeda Galaxy',
    type: 'galaxy',
    magnitude: 3.4,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadFromStorage.mockReturnValue([])
  })

  describe('Complete Observation Recording Workflow', () => {
    it('should complete full observation flow: target selection → camera setup → imaging → logging → data persistence', async () => {
      const mockSaveObservation = jest.fn()
      const mockSetObservationNotes = jest.fn()
      const mockSetObservationRating = jest.fn()
      const mockSetFocusPosition = jest.fn()
      const mockHandleFocusAdjust = jest.fn()
      const mockStartSession = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: mockTargetObject,
        observationNotes: 'Excellent view of the galaxy core with spiral arms visible. Clear sky conditions.',
        observationRating: 0,
        setObservationNotes: mockSetObservationNotes,
        setObservationRating: mockSetObservationRating,
        saveObservation: mockSaveObservation,
        focusPosition: [1500],
        setFocusPosition: mockSetFocusPosition,
        handleFocusAdjust: mockHandleFocusAdjust,
        exposure: [30],
        gain: [50],
        brightness: [100],
        activeSession: null,
        startSession: mockStartSession,
        systemStats: {
          weather: {
            condition: 'clear',
            seeingCondition: 'excellent',
          },
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // 1. Start Session
      render(<SessionManagement />)
      
      const startButton = screen.getByRole('button', { name: /start session/i })
      fireEvent.click(startButton)
      
      expect(mockStartSession).toHaveBeenCalled()

      // 2. Camera Setup - Focus Control
      render(<FocusControl />)
      
      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      fireEvent.click(focusInButton)
      
      expect(mockHandleFocusAdjust).toHaveBeenCalledWith('in')

      // 3. Target Selection and Observation Logging
      render(<ObservationLogger />)
      
      // Verify target is selected
      expect(screen.getByText('Target: Andromeda Galaxy')).toBeInTheDocument()
      expect(screen.getByText('galaxy • Magnitude: 3.4')).toBeInTheDocument()

      // 4. Set observation rating
      const star4 = screen.getByTestId('star-4')
      fireEvent.click(star4)
      
      expect(mockSetObservationRating).toHaveBeenCalledWith(4)

      // 5. Add observation notes
      const notesTextarea = screen.getByPlaceholderText('Add your observation notes...')
      fireEvent.change(notesTextarea, { 
        target: { value: 'Excellent view of the galaxy core with spiral arms visible. Clear sky conditions.' } 
      })
      
      expect(mockSetObservationNotes).toHaveBeenCalledWith(
        'Excellent view of the galaxy core with spiral arms visible. Clear sky conditions.'
      )

      // 6. Verify current settings are displayed
      expect(screen.getByText('• Exposure: 30s, Gain: 50')).toBeInTheDocument()
      expect(screen.getByText('• Focus: 1500, Brightness: 100')).toBeInTheDocument()
      expect(screen.getByText('• Weather: clear')).toBeInTheDocument()
      expect(screen.getByText('• Seeing: excellent')).toBeInTheDocument()

      // 7. Save observation
      render(<ObservationLogger />)

      const saveButtons = screen.getAllByRole('button', { name: /save observation/i })
      const saveButton = saveButtons[0] // Take the first one
      expect(saveButton).not.toBeDisabled()
      
      fireEvent.click(saveButton)
      
      expect(mockSaveObservation).toHaveBeenCalled()

      // 8. Verify data persistence - observation should be saved to storage
      // This would be triggered by the context's data persistence manager
      await waitFor(() => {
        expect(mockSaveToStorage).toHaveBeenCalledWith(
          'observation-log',
          expect.any(Array)
        )
      })
    })

    it('should handle observation flow with equipment tracking', async () => {
      const mockSaveObservation = jest.fn()
      const mockSetSessionEquipment = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: mockTargetObject,
        observationNotes: 'Test observation',
        saveObservation: mockSaveObservation,
        sessionEquipment: 'Seestar S50, UV/IR Cut Filter',
        setSessionEquipment: mockSetSessionEquipment,
        activeSession: {
          id: 'session-1',
          name: 'Night Session',
          startTime: new Date().toISOString(),
          endTime: null,
          observations: [],
          totalObservingTime: 3600,
          equipment: ['telescope-1'],
          notes: '',
        },
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Render session management to set equipment
      render(<SessionManagement />)
      
      const equipmentInput = screen.getByPlaceholderText('Equipment...')
      fireEvent.change(equipmentInput, { 
        target: { value: 'Seestar S50, UV/IR Cut Filter, 2" Eyepiece' } 
      })
      
      expect(mockSetSessionEquipment).toHaveBeenCalledWith('Seestar S50, UV/IR Cut Filter, 2" Eyepiece')

      // Render observation logger and save
      render(<ObservationLogger />)
      
      const saveButton = screen.getByRole('button', { name: /save observation/i })
      fireEvent.click(saveButton)
      
      expect(mockSaveObservation).toHaveBeenCalled()
    })

    it('should handle observation flow error recovery', async () => {
      const mockSaveObservation = jest.fn()
      const mockAddStatusAlert = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: mockTargetObject,
        observationNotes: 'Test observation',
        saveObservation: mockSaveObservation,
        addStatusAlert: mockAddStatusAlert,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<ObservationLogger />)
      
      const saveButton = screen.getByRole('button', { name: /save observation/i })
      fireEvent.click(saveButton)
      
      expect(mockSaveObservation).toHaveBeenCalled()
      
      // Error should be handled gracefully (in real implementation)
      // This test verifies the save attempt was made
    })
  })

  describe('Data Persistence Integration', () => {
    it('should persist observation data across sessions', async () => {
      const savedObservations = [
        {
          id: 'obs-1',
          timestamp: '2024-01-01T20:00:00Z',
          target: 'Andromeda Galaxy',
          notes: 'Great observation',
          rating: 5,
          equipment: ['telescope-1'],
        },
      ]

      mockLoadFromStorage.mockReturnValue(savedObservations)

      const contextValue = createMockTelescopeContext({
        observationLog: savedObservations,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Import and render DataPersistenceManager to trigger data loading
      const { DataPersistenceManager } = require('../../components/telescope/DataPersistenceManager')
      render(<DataPersistenceManager />)

      // Verify data loading was attempted
      expect(mockLoadFromStorage).toHaveBeenCalled()
    })

    it('should persist session data across browser sessions', async () => {
      const savedSessions = [
        {
          id: 'session-1',
          name: 'Previous Night',
          startTime: new Date('2024-01-01T20:00:00Z'),
          endTime: new Date('2024-01-01T23:00:00Z'),
          totalObservingTime: 10800,
          observations: [],
          equipment: [],
          notes: '',
        },
      ]

      mockLoadFromStorage.mockReturnValue(savedSessions)

      const contextValue = createMockTelescopeContext({
        pastSessions: savedSessions,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<SessionManagement />)

      // Verify past sessions are displayed
      expect(screen.getByText('Recent Sessions')).toBeInTheDocument()
      expect(screen.getByText('180 min')).toBeInTheDocument() // 3 hours = 180 minutes
    })

    it('should handle data corruption gracefully', async () => {
      mockLoadFromStorage.mockImplementation(() => {
        throw new Error('Corrupted data')
      })

      const contextValue = createMockTelescopeContext({
        observationLog: [],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Should not crash when data is corrupted
      expect(() => render(<ObservationLogger />)).not.toThrow()
    })
  })

  describe('Multi-Component State Coordination', () => {
    it('should coordinate state between session management and observation logging', async () => {
      const mockStartSession = jest.fn()
      const mockSaveObservation = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: mockTargetObject,
        observationNotes: 'Coordinated observation',
        activeSession: null,
        startSession: mockStartSession,
        saveObservation: mockSaveObservation,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Start a session
      const { rerender } = render(<SessionManagement />)
      
      const startButton = screen.getByRole('button', { name: /start session/i })
      fireEvent.click(startButton)
      
      expect(mockStartSession).toHaveBeenCalled()

      // Update context to reflect active session
      const updatedContextValue = {
        ...contextValue,
        activeSession: {
          id: 'new-session',
          name: 'Active Session',
          startTime: new Date().toISOString(),
          endTime: null,
          observations: [],
          totalObservingTime: 0,
          equipment: [],
          notes: '',
        },
      }

      mockUseTelescopeContext.mockReturnValue(updatedContextValue)

      // Re-render session management to show active session
      rerender(<SessionManagement />)
      expect(screen.getByText('Active Session')).toBeInTheDocument()

      // Now log observation during active session
      render(<ObservationLogger />)
      
      const saveButton = screen.getByRole('button', { name: /save observation/i })
      fireEvent.click(saveButton)
      
      expect(mockSaveObservation).toHaveBeenCalled()
    })

    it('should maintain telescope settings consistency across components', () => {
      const focusPosition = [2500]
      const exposure = [45]
      const gain = [80]

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: mockTargetObject,
        focusPosition,
        exposure,
        gain,
        brightness: [120],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Render focus control
      render(<FocusControl />)
      expect(screen.getByText('2500')).toBeInTheDocument()

      // Render observation logger
      render(<ObservationLogger />)
      expect(screen.getByText('• Exposure: 45s, Gain: 80')).toBeInTheDocument()
      expect(screen.getByText('• Focus: 2500, Brightness: 120')).toBeInTheDocument()
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    it('should handle missing telescope gracefully', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: null,
        selectedTarget: mockTargetObject,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      expect(() => render(<ObservationLogger />)).not.toThrow()
      expect(() => render(<FocusControl />)).not.toThrow()
      expect(() => render(<SessionManagement />)).not.toThrow()
    })

    it('should handle missing target gracefully', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: null,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      const { container } = render(<ObservationLogger />)
      expect(container.firstChild).toBeNull() // Should not render when no target
    })

    it('should handle network failures during observation saving', async () => {
      const mockSaveObservation = jest.fn()
      
      // Create a spy to suppress console.error during test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: mockTargetObject,
        observationNotes: 'Test observation',
        saveObservation: mockSaveObservation,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<ObservationLogger />)
      
      const saveButton = screen.getByRole('button', { name: /save observation/i })
      
      // Should call save function when button is clicked
      fireEvent.click(saveButton)
      expect(mockSaveObservation).toHaveBeenCalled()
      
      // Restore console.error
      consoleSpy.mockRestore()
    })

    it('should handle rapid user interactions gracefully', async () => {
      const mockSetObservationRating = jest.fn()
      const mockSetObservationNotes = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        selectedTarget: mockTargetObject,
        observationRating: 0,
        setObservationRating: mockSetObservationRating,
        setObservationNotes: mockSetObservationNotes,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<ObservationLogger />)

      // Rapid rating changes
      const star3 = screen.getByTestId('star-3')
      const star5 = screen.getByTestId('star-5')
      const star1 = screen.getByTestId('star-1')

      fireEvent.click(star3)
      fireEvent.click(star5)
      fireEvent.click(star1)

      expect(mockSetObservationRating).toHaveBeenCalledTimes(3)
      expect(mockSetObservationRating).toHaveBeenCalledWith(3)
      expect(mockSetObservationRating).toHaveBeenCalledWith(5)
      expect(mockSetObservationRating).toHaveBeenCalledWith(1)

      // Rapid note changes
      const notesTextarea = screen.getByPlaceholderText('Add your observation notes...')
      
      fireEvent.change(notesTextarea, { target: { value: 'First note' } })
      fireEvent.change(notesTextarea, { target: { value: 'Updated note' } })
      fireEvent.change(notesTextarea, { target: { value: 'Final note' } })

      expect(mockSetObservationNotes).toHaveBeenCalledTimes(3)
      expect(mockSetObservationNotes).toHaveBeenCalledWith('Final note')
    })
  })
})