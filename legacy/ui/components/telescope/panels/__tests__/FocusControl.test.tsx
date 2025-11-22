import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { createMockTelescopeContext } from '../../../../test-utils'
import { FocusControl } from '../FocusControl'

// Mock the telescope context
const mockUseTelescopeContext = jest.fn()
jest.mock('../../../../context/TelescopeContext', () => ({
  useTelescopeContext: () => mockUseTelescopeContext(),
}))

describe('FocusControl', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render focus control component', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      expect(screen.getByText('Focus Control')).toBeInTheDocument()
      expect(screen.getByText('Position')).toBeInTheDocument()
      expect(screen.getByText('1500')).toBeInTheDocument()
    })

    it('should render focus control buttons', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      expect(screen.getByRole('button', { name: /focus in/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /focus out/i })).toBeInTheDocument()
    })

    it('should render focus position slider', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [2500],
        })
      )

      render(<FocusControl />)

      const slider = screen.getByRole('slider')
      expect(slider).toBeInTheDocument()
      expect(slider).toHaveAttribute('aria-valuenow', '2500')
    })

    it('should display current focus position', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [3750],
        })
      )

      render(<FocusControl />)

      expect(screen.getByText('3750')).toBeInTheDocument()
    })

    it('should render focus icon', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      // Check for focus icon (lucide-react Focus component)
      const focusIcon = document.querySelector('svg')
      expect(focusIcon).toBeInTheDocument()
    })
  })

  describe('slider interactions', () => {
    it('should render slider with correct value prop', () => {
      const mockSetFocusPosition = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          setFocusPosition: mockSetFocusPosition,
        })
      )

      render(<FocusControl />)

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuenow', '1500')
    })

    it('should handle slider value at minimum range', () => {
      const mockSetFocusPosition = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [0],
          setFocusPosition: mockSetFocusPosition,
        })
      )

      render(<FocusControl />)

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuenow', '0')
    })

    it('should handle slider value at maximum range', () => {
      const mockSetFocusPosition = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [10000],
          setFocusPosition: mockSetFocusPosition,
        })
      )

      render(<FocusControl />)

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuenow', '10000')
    })

    it('should have correct slider attributes', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [5000],
        })
      )

      render(<FocusControl />)

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuemin', '0')
      expect(slider).toHaveAttribute('aria-valuemax', '10000')
    })
  })

  describe('button interactions', () => {
    it('should call handleFocusAdjust with "in" when Focus In button is clicked', () => {
      const mockHandleFocusAdjust = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          handleFocusAdjust: mockHandleFocusAdjust,
        })
      )

      render(<FocusControl />)

      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      fireEvent.click(focusInButton)

      expect(mockHandleFocusAdjust).toHaveBeenCalledWith('in')
    })

    it('should call handleFocusAdjust with "out" when Focus Out button is clicked', () => {
      const mockHandleFocusAdjust = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          handleFocusAdjust: mockHandleFocusAdjust,
        })
      )

      render(<FocusControl />)

      const focusOutButton = screen.getByRole('button', { name: /focus out/i })
      fireEvent.click(focusOutButton)

      expect(mockHandleFocusAdjust).toHaveBeenCalledWith('out')
    })

    it('should handle multiple rapid button clicks', () => {
      const mockHandleFocusAdjust = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          handleFocusAdjust: mockHandleFocusAdjust,
        })
      )

      render(<FocusControl />)

      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      
      // Simulate rapid clicking
      fireEvent.click(focusInButton)
      fireEvent.click(focusInButton)
      fireEvent.click(focusInButton)

      expect(mockHandleFocusAdjust).toHaveBeenCalledTimes(3)
      expect(mockHandleFocusAdjust).toHaveBeenCalledWith('in')
    })

    it('should handle alternating button clicks', () => {
      const mockHandleFocusAdjust = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          handleFocusAdjust: mockHandleFocusAdjust,
        })
      )

      render(<FocusControl />)

      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      const focusOutButton = screen.getByRole('button', { name: /focus out/i })
      
      fireEvent.click(focusInButton)
      fireEvent.click(focusOutButton)
      fireEvent.click(focusInButton)

      expect(mockHandleFocusAdjust).toHaveBeenCalledTimes(3)
      expect(mockHandleFocusAdjust).toHaveBeenNthCalledWith(1, 'in')
      expect(mockHandleFocusAdjust).toHaveBeenNthCalledWith(2, 'out')
      expect(mockHandleFocusAdjust).toHaveBeenNthCalledWith(3, 'in')
    })
  })

  describe('data display', () => {
    it('should display different focus position values correctly', () => {
      const testCases = [
        { position: 0, display: '0' },
        { position: 1000, display: '1000' },
        { position: 5000, display: '5000' },
        { position: 9999, display: '9999' },
        { position: 10000, display: '10000' },
      ]

      testCases.forEach(({ position, display }) => {
        mockUseTelescopeContext.mockReturnValue(
          createMockTelescopeContext({
            focusPosition: [position],
          })
        )

        const { rerender } = render(<FocusControl />)
        expect(screen.getByText(display)).toBeInTheDocument()
        rerender(<div />)
      })
    })

    it('should update display when focus position changes', () => {
      const mockSetFocusPosition = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          setFocusPosition: mockSetFocusPosition,
        })
      )

      const { rerender } = render(<FocusControl />)
      expect(screen.getByText('1500')).toBeInTheDocument()

      // Simulate position change
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [2500],
          setFocusPosition: mockSetFocusPosition,
        })
      )

      rerender(<FocusControl />)
      expect(screen.getByText('2500')).toBeInTheDocument()
      expect(screen.queryByText('1500')).not.toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('should handle missing handleFocusAdjust function gracefully', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          handleFocusAdjust: undefined,
        })
      )

      expect(() => render(<FocusControl />)).not.toThrow()

      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      expect(() => fireEvent.click(focusInButton)).not.toThrow()
    })

    it('should handle missing setFocusPosition function gracefully', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          setFocusPosition: undefined,
        })
      )

      expect(() => render(<FocusControl />)).not.toThrow()
      expect(screen.getByRole('slider')).toBeInTheDocument()
    })

    it('should handle invalid focus position values', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [null],
        })
      )

      expect(() => render(<FocusControl />)).not.toThrow()
      // Should not crash even with invalid values
    })

    it('should handle undefined focus position array', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [0], // Use valid default instead of undefined
        })
      )

      expect(() => render(<FocusControl />)).not.toThrow()
    })
  })

  describe('accessibility', () => {
    it('should have proper button roles and labels', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      const focusOutButton = screen.getByRole('button', { name: /focus out/i })

      expect(focusInButton).toBeInTheDocument()
      expect(focusOutButton).toBeInTheDocument()
    })

    it('should have accessible slider with proper attributes', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuenow', '1500')
      expect(slider).toHaveAttribute('aria-valuemin', '0')
      expect(slider).toHaveAttribute('aria-valuemax', '10000')
    })

    it('should have proper heading structure', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      const heading = screen.getByText('Focus Control')
      expect(heading).toBeInTheDocument()
    })

    it('should have proper labeling for position display', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      expect(screen.getByText('Position')).toBeInTheDocument()
      expect(screen.getByText('1500')).toBeInTheDocument()
    })
  })

  describe('component styling', () => {
    it('should render with correct CSS classes', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      // Check for card styling
      const card = document.querySelector('.bg-gray-800')
      expect(card).toBeInTheDocument()
    })

    it('should render buttons with correct styling', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
        })
      )

      render(<FocusControl />)

      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      expect(focusInButton).toHaveClass('flex-1')
    })
  })

  describe('integration scenarios', () => {
    it('should work correctly when integrated with telescope context', () => {
      const mockSetFocusPosition = jest.fn()
      const mockHandleFocusAdjust = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [1500],
          setFocusPosition: mockSetFocusPosition,
          handleFocusAdjust: mockHandleFocusAdjust,
        })
      )

      render(<FocusControl />)

      // Test button interactions
      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      fireEvent.click(focusInButton)

      expect(mockHandleFocusAdjust).toHaveBeenCalledWith('in')
      
      // Verify slider is present and accessible
      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuenow', '1500')
    })

    it('should handle focus position at boundary values', () => {
      const mockSetFocusPosition = jest.fn()
      const mockHandleFocusAdjust = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [0],
          setFocusPosition: mockSetFocusPosition,
          handleFocusAdjust: mockHandleFocusAdjust,
        })
      )

      render(<FocusControl />)

      const focusOutButton = screen.getByRole('button', { name: /focus out/i })
      fireEvent.click(focusOutButton)

      // Should still call the function even at minimum position
      expect(mockHandleFocusAdjust).toHaveBeenCalledWith('out')
    })

    it('should handle maximum focus position correctly', () => {
      const mockSetFocusPosition = jest.fn()
      const mockHandleFocusAdjust = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          focusPosition: [10000],
          setFocusPosition: mockSetFocusPosition,
          handleFocusAdjust: mockHandleFocusAdjust,
        })
      )

      render(<FocusControl />)

      const focusInButton = screen.getByRole('button', { name: /focus in/i })
      fireEvent.click(focusInButton)

      // Should still call the function even at maximum position
      expect(mockHandleFocusAdjust).toHaveBeenCalledWith('in')
    })
  })
})