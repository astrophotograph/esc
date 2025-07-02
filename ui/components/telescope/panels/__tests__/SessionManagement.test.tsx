import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { createMockTelescopeContext, mockSession } from '../../../../test-utils'
import { SessionManagement } from '../SessionManagement'

// Mock the telescope context
const mockUseTelescopeContext = jest.fn()
jest.mock('../../../../context/TelescopeContext', () => ({
  useTelescopeContext: () => mockUseTelescopeContext(),
}))

// Mock the telescope utils
jest.mock('../../../../utils/telescope-utils', () => ({
  formatSessionTime: jest.fn((seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }),
}))

describe('SessionManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering without active session', () => {
    it('should render session management form when no active session', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ activeSession: null })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Session Management')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument()
    })

    it('should render location input field', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ activeSession: null })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Location')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Observation location...')).toBeInTheDocument()
    })

    it('should render notes textarea', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ activeSession: null })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Notes')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Session notes...')).toBeInTheDocument()
    })

    it('should display current observing location when available', () => {
      const mockLocation = {
        id: 'loc-1',
        name: 'Test Observatory',
        latitude: 40.7128,
        longitude: -74.0060,
        timezone: 'America/New_York',
        lightPollution: { bortle: 3 },
      }

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          currentObservingLocation: mockLocation,
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Current: Test Observatory')).toBeInTheDocument()
      expect(screen.getByText('• Bortle 3')).toBeInTheDocument()
    })

    it('should display past sessions when available', () => {
      const pastSession = mockSession({
        id: 'past-1',
        startTime: new Date('2024-01-01T20:00:00Z'),
        endTime: new Date('2024-01-01T22:00:00Z'),
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          pastSessions: [pastSession],
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Recent Sessions')).toBeInTheDocument()
      expect(screen.getByText('120 min')).toBeInTheDocument()
    })
  })

  describe('rendering with active session', () => {
    const activeSession = mockSession({
      id: 'active-1',
      name: 'Active Session',
      startTime: new Date(),
    })

    it('should render active session interface', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimer: 3661, // 1 hour, 1 minute, 1 second
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Active Session')).toBeInTheDocument()
      expect(screen.getByText('01:01:01')).toBeInTheDocument()
    })

    it('should render session timer display', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimer: 3600, // 1 hour
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Duration')).toBeInTheDocument()
      expect(screen.getByText('01:00:00')).toBeInTheDocument()
    })

    it('should render location and equipment inputs during active session', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionLocation: 'Observatory',
          sessionEquipment: 'Telescope + Camera',
        })
      )

      render(<SessionManagement />)

      const locationInput = screen.getByDisplayValue('Observatory')
      const equipmentInput = screen.getByDisplayValue('Telescope + Camera')
      
      expect(locationInput).toBeInTheDocument()
      expect(equipmentInput).toBeInTheDocument()
    })

    it('should render session notes textarea during active session', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionNotes: 'Great observing night',
        })
      )

      render(<SessionManagement />)

      const notesTextarea = screen.getByDisplayValue('Great observing night')
      expect(notesTextarea).toBeInTheDocument()
    })

    it('should render weather information during active session', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          systemStats: {
            temperature: 15.5,
            weather: {
              condition: 'clear',
              seeingCondition: 'excellent',
              humidity: 42,
            },
          },
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Weather: clear')).toBeInTheDocument()
      expect(screen.getByText('Seeing: excellent')).toBeInTheDocument()
      expect(screen.getByText('Temp: 15.5°C')).toBeInTheDocument()
      expect(screen.getByText('Humidity: 42%')).toBeInTheDocument()
    })

    it('should render pause button when session timer is running', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimerRef: { current: setInterval(() => {}, 1000) },
        })
      )

      render(<SessionManagement />)

      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /end/i })).toBeInTheDocument()
    })

    it('should render resume button when session timer is paused', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimerRef: { current: null },
        })
      )

      render(<SessionManagement />)

      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /end/i })).toBeInTheDocument()
    })
  })

  describe('user interactions', () => {
    it('should call startSession when start button is clicked', () => {
      const mockStartSession = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          startSession: mockStartSession,
        })
      )

      render(<SessionManagement />)

      const startButton = screen.getByRole('button', { name: /start session/i })
      fireEvent.click(startButton)

      expect(mockStartSession).toHaveBeenCalledTimes(1)
    })

    it('should call pauseSession when pause button is clicked', () => {
      const mockPauseSession = jest.fn()
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimerRef: { current: setInterval(() => {}, 1000) },
          pauseSession: mockPauseSession,
        })
      )

      render(<SessionManagement />)

      const pauseButton = screen.getByRole('button', { name: /pause/i })
      fireEvent.click(pauseButton)

      expect(mockPauseSession).toHaveBeenCalledTimes(1)
    })

    it('should call resumeSession when resume button is clicked', () => {
      const mockResumeSession = jest.fn()
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimerRef: { current: null },
          resumeSession: mockResumeSession,
        })
      )

      render(<SessionManagement />)

      const resumeButton = screen.getByRole('button', { name: /resume/i })
      fireEvent.click(resumeButton)

      expect(mockResumeSession).toHaveBeenCalledTimes(1)
    })

    it('should call endSession when end button is clicked', () => {
      const mockEndSession = jest.fn()
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          endSession: mockEndSession,
        })
      )

      render(<SessionManagement />)

      const endButton = screen.getByRole('button', { name: /end/i })
      fireEvent.click(endButton)

      expect(mockEndSession).toHaveBeenCalledTimes(1)
    })

    it('should update session location when input changes', () => {
      const mockSetSessionLocation = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          sessionLocation: '',
          setSessionLocation: mockSetSessionLocation,
        })
      )

      render(<SessionManagement />)

      const locationInput = screen.getByPlaceholderText('Observation location...')
      fireEvent.change(locationInput, { target: { value: 'Dark Sky Site' } })

      expect(mockSetSessionLocation).toHaveBeenCalledWith('Dark Sky Site')
    })

    it('should update session equipment when input changes', () => {
      const mockSetSessionEquipment = jest.fn()
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionEquipment: '',
          setSessionEquipment: mockSetSessionEquipment,
        })
      )

      render(<SessionManagement />)

      const equipmentInput = screen.getByPlaceholderText('Equipment...')
      fireEvent.change(equipmentInput, { target: { value: 'Seestar S50' } })

      expect(mockSetSessionEquipment).toHaveBeenCalledWith('Seestar S50')
    })

    it('should update session notes when textarea changes', () => {
      const mockSetSessionNotes = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          sessionNotes: '',
          setSessionNotes: mockSetSessionNotes,
        })
      )

      render(<SessionManagement />)

      const notesTextarea = screen.getByPlaceholderText('Session notes...')
      fireEvent.change(notesTextarea, { target: { value: 'Clear skies tonight' } })

      expect(mockSetSessionNotes).toHaveBeenCalledWith('Clear skies tonight')
    })
  })

  describe('data display', () => {
    it('should format session duration correctly', () => {
      const { formatSessionTime } = require('../../../../utils/telescope-utils')
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimer: 3725, // 1 hour, 2 minutes, 5 seconds
        })
      )

      render(<SessionManagement />)

      expect(formatSessionTime).toHaveBeenCalledWith(3725)
      expect(screen.getByText('01:02:05')).toBeInTheDocument()
    })

    it('should display past session duration in minutes', () => {
      const pastSession = mockSession({
        startTime: new Date('2024-01-01T20:00:00Z'),
        endTime: new Date('2024-01-01T21:30:00Z'), // 90 minutes
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          pastSessions: [pastSession],
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('90 min')).toBeInTheDocument()
    })

    it('should handle past session without end time', () => {
      const pastSession = mockSession({
        startTime: new Date('2024-01-01T20:00:00Z'),
        endTime: null,
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          pastSessions: [pastSession],
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('? min')).toBeInTheDocument()
    })

    it('should limit past sessions display to 3 most recent', () => {
      const pastSessions = Array.from({ length: 5 }, (_, i) =>
        mockSession({
          id: `session-${i}`,
          startTime: new Date(`2024-01-0${i + 1}T20:00:00Z`),
          endTime: new Date(`2024-01-0${i + 1}T21:00:00Z`),
        })
      )

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          pastSessions,
        })
      )

      render(<SessionManagement />)

      // Should only show first 3 sessions
      const sessionElements = screen.getAllByText(/min$/)
      expect(sessionElements).toHaveLength(3)
    })
  })

  describe('edge cases', () => {
    it('should handle missing current observing location gracefully', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          currentObservingLocation: null,
        })
      )

      render(<SessionManagement />)

      expect(screen.getByPlaceholderText('Observation location...')).toBeInTheDocument()
      expect(screen.queryByText('Current:')).not.toBeInTheDocument()
    })

    it('should handle observing location without bortle scale', () => {
      const mockLocation = {
        id: 'loc-1',
        name: 'Test Location',
        latitude: 0,
        longitude: 0,
        timezone: 'UTC',
        lightPollution: {},
      }

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession: null,
          currentObservingLocation: mockLocation,
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Current: Test Location')).toBeInTheDocument()
      expect(screen.queryByText(/Bortle/)).not.toBeInTheDocument()
    })

    it('should handle missing system stats gracefully', () => {
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          systemStats: {},
        })
      )

      render(<SessionManagement />)

      // Should not crash, but weather info may not display
      expect(screen.getByText('Active Session')).toBeInTheDocument()
    })

    it('should handle undefined session timer', () => {
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimer: undefined,
        })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Active Session')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have proper labels for form inputs', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ activeSession: null })
      )

      render(<SessionManagement />)

      expect(screen.getByText('Location')).toBeInTheDocument()
      expect(screen.getByText('Notes')).toBeInTheDocument()
    })

    it('should have accessible buttons with proper roles', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ activeSession: null })
      )

      render(<SessionManagement />)

      const startButton = screen.getByRole('button', { name: /start session/i })
      expect(startButton).toBeInTheDocument()
    })

    it('should have accessible session control buttons', () => {
      const activeSession = mockSession()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          activeSession,
          sessionTimerRef: { current: setInterval(() => {}, 1000) },
        })
      )

      render(<SessionManagement />)

      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /end/i })).toBeInTheDocument()
    })
  })
})