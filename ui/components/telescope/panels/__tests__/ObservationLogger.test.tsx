import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { mockCelestialObject, createMockTelescopeContext } from '../../../../test-utils'
import { ObservationLogger } from '../ObservationLogger'

// Mock the telescope context
const mockUseTelescopeContext = jest.fn()
jest.mock('../../../../context/TelescopeContext', () => ({
  useTelescopeContext: () => mockUseTelescopeContext(),
}))

// Mock the telescope utils
jest.mock('../../../../utils/telescope-utils', () => ({
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
}))

describe('ObservationLogger', () => {
  const mockSelectedTarget = mockCelestialObject({
    name: 'Andromeda Galaxy',
    type: 'galaxy',
    magnitude: 3.4,
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render nothing when no target is selected', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: null })
      )
      
      const { container } = render(<ObservationLogger />)
      expect(container.firstChild).toBeNull()
    })

    it('should render observation logger when target is selected', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: mockSelectedTarget })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('Log Observation')).toBeInTheDocument()
      expect(screen.getByText('Target: Andromeda Galaxy')).toBeInTheDocument()
      expect(screen.getByText('galaxy • Magnitude: 3.4')).toBeInTheDocument()
    })

    it('should render rating section', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: mockSelectedTarget })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('Rating')).toBeInTheDocument()
      expect(screen.getByTestId('star-rating')).toBeInTheDocument()
    })

    it('should render notes section', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: mockSelectedTarget })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('Notes')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Add your observation notes...')).toBeInTheDocument()
    })

    it('should render current settings section', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          exposure: [30],
          gain: [50],
          brightness: [100],
          focusPosition: [1500],
        })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('Current Settings:')).toBeInTheDocument()
      expect(screen.getByText('• Exposure: 30s, Gain: 50')).toBeInTheDocument()
      expect(screen.getByText('• Focus: 1500, Brightness: 100')).toBeInTheDocument()
    })

    it('should render save button', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: mockSelectedTarget })
      )

      render(<ObservationLogger />)

      const saveButton = screen.getByRole('button', { name: /save observation/i })
      expect(saveButton).toBeInTheDocument()
      expect(saveButton).toBeDisabled() // Should be disabled when notes are empty
    })
  })

  describe('user interactions', () => {
    it('should update notes when textarea value changes', () => {
      const mockSetObservationNotes = jest.fn()
      
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          observationNotes: '',
          setObservationNotes: mockSetObservationNotes,
        })
      )

      render(<ObservationLogger />)

      const textarea = screen.getByPlaceholderText('Add your observation notes...')
      fireEvent.change(textarea, { target: { value: 'Great view of the galaxy tonight!' } })

      expect(mockSetObservationNotes).toHaveBeenCalledWith('Great view of the galaxy tonight!')
    })

    it('should enable save button when notes have content', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          observationNotes: 'Some notes',
        })
      )

      render(<ObservationLogger />)

      const saveButton = screen.getByRole('button', { name: /save observation/i })
      expect(saveButton).not.toBeDisabled()
    })

    it('should disable save button when notes are empty or whitespace', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          observationNotes: '   ',
        })
      )

      render(<ObservationLogger />)

      const saveButton = screen.getByRole('button', { name: /save observation/i })
      expect(saveButton).toBeDisabled()
    })

    it('should call saveObservation when save button is clicked', () => {
      const mockSaveObservation = jest.fn()
      
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          observationNotes: 'Great observation!',
          saveObservation: mockSaveObservation,
        })
      )

      render(<ObservationLogger />)

      const saveButton = screen.getByRole('button', { name: /save observation/i })
      fireEvent.click(saveButton)

      expect(mockSaveObservation).toHaveBeenCalledTimes(1)
    })

    it('should pass correct props to renderStarRating', () => {
      const mockSetObservationRating = jest.fn()
      const { renderStarRating } = require('../../../../utils/telescope-utils')
      
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          observationRating: 3,
          setObservationRating: mockSetObservationRating,
        })
      )

      render(<ObservationLogger />)

      expect(renderStarRating).toHaveBeenCalledWith(3, true, mockSetObservationRating)
    })
  })

  describe('data display', () => {
    it('should display current exposure and gain settings', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          exposure: [45],
          gain: [75],
        })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('• Exposure: 45s, Gain: 75')).toBeInTheDocument()
    })

    it('should display current focus and brightness settings', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          focusPosition: [2000],
          brightness: [80],
        })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('• Focus: 2000, Brightness: 80')).toBeInTheDocument()
    })

    it('should display weather conditions from system stats', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          systemStats: {
            weather: {
              condition: 'clear',
              seeingCondition: 'excellent',
            }
          }
        })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('• Weather: clear')).toBeInTheDocument()
      expect(screen.getByText('• Seeing: excellent')).toBeInTheDocument()
    })

    it('should display different target types correctly', () => {
      const starTarget = mockCelestialObject({
        name: 'Sirius',
        type: 'star',
        magnitude: -1.46,
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: starTarget })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('Target: Sirius')).toBeInTheDocument()
      expect(screen.getByText('star • Magnitude: -1.46')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have proper labels for form elements', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: mockSelectedTarget })
      )

      render(<ObservationLogger />)

      expect(screen.getByText('Rating')).toBeInTheDocument()
      expect(screen.getByText('Notes')).toBeInTheDocument()
    })

    it('should have proper button accessibility', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          observationNotes: 'Test notes',
        })
      )

      render(<ObservationLogger />)

      const saveButton = screen.getByRole('button', { name: /save observation/i })
      expect(saveButton).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('should handle target with missing magnitude', () => {
      const targetWithoutMagnitude = mockCelestialObject({
        name: 'Unknown Object',
        type: 'unknown',
        magnitude: undefined,
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ selectedTarget: targetWithoutMagnitude })
      )

      render(<ObservationLogger />)

      expect(screen.getByText(/unknown.*Magnitude:/)).toBeInTheDocument()
    })

    it('should handle missing weather data gracefully', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          systemStats: {}
        })
      )

      render(<ObservationLogger />)

      // Should not crash and render basic structure
      expect(screen.getByText('Log Observation')).toBeInTheDocument()
    })

    it('should handle undefined settings arrays', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          selectedTarget: mockSelectedTarget,
          exposure: undefined,
          gain: undefined,
          brightness: undefined,
          focusPosition: undefined,
        })
      )

      render(<ObservationLogger />)

      // Should handle undefined gracefully without crashing
      expect(screen.getByText('Log Observation')).toBeInTheDocument()
    })
  })
})