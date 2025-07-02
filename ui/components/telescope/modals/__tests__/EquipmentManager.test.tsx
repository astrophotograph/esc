import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { createMockTelescopeContext, mockEquipment, mockMaintenanceRecord, mockEquipmentSet } from '../../../../test-utils'
import { EquipmentManager } from '../EquipmentManager'

// Mock the telescope context
const mockUseTelescopeContext = jest.fn()
jest.mock('../../../../context/TelescopeContext', () => ({
  useTelescopeContext: () => mockUseTelescopeContext(),
}))

describe('EquipmentManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('should not render when showEquipmentManager is false', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: false })
      )

      const { container } = render(<EquipmentManager />)
      expect(container.firstChild).toBeNull()
    })

    it('should render equipment manager modal when showEquipmentManager is true', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      expect(screen.getByText('Equipment Manager')).toBeInTheDocument()
      // Look for the X button (close button) - it may not have accessible text
      const closeButton = screen.getByRole('button', { name: '' })
      expect(closeButton).toBeInTheDocument()
    })

    it('should render tabs for different equipment sections', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      expect(screen.getByRole('tab', { name: /equipment/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /maintenance/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /sets/i })).toBeInTheDocument()
    })

    it('should render search input', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      expect(screen.getByPlaceholderText(/search equipment/i)).toBeInTheDocument()
    })
  })

  describe('equipment tab', () => {
    it('should display equipment list when equipment exists', () => {
      const testEquipment = mockEquipment({
        name: 'Test Telescope',
        type: 'telescope',
        brand: 'Test Brand',
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipment: [testEquipment],
        })
      )

      render(<EquipmentManager />)

      expect(screen.getByText('Test Telescope')).toBeInTheDocument()
      expect(screen.getByText('Test Brand')).toBeInTheDocument()
    })

    it('should show add equipment button', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipment: [],
        })
      )

      render(<EquipmentManager />)

      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument()
    })

    it('should display empty state when no equipment', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipment: [],
        })
      )

      render(<EquipmentManager />)

      expect(screen.getByText(/no equipment found/i)).toBeInTheDocument()
    })
  })

  describe('maintenance tab', () => {
    it('should display maintenance records when they exist', () => {
      const testMaintenance = mockMaintenanceRecord({
        type: 'cleaning',
        description: 'Cleaned telescope mirrors',
        equipmentId: 'equipment-1',
      })

      const testEquipment = mockEquipment({
        id: 'equipment-1',
        name: 'Test Telescope',
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          maintenanceRecords: [testMaintenance],
          equipment: [testEquipment],
        })
      )

      render(<EquipmentManager />)

      // Switch to maintenance tab
      fireEvent.click(screen.getByRole('tab', { name: /maintenance/i }))

      expect(screen.getByText('Cleaned telescope mirrors')).toBeInTheDocument()
      expect(screen.getByText('Test Telescope')).toBeInTheDocument()
    })

    it('should show add maintenance button', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          maintenanceRecords: [],
        })
      )

      render(<EquipmentManager />)

      // Switch to maintenance tab
      fireEvent.click(screen.getByRole('tab', { name: /maintenance/i }))

      expect(screen.getByRole('button', { name: /add maintenance/i })).toBeInTheDocument()
    })
  })

  describe('equipment sets tab', () => {
    it('should display equipment sets when they exist', () => {
      const testSet = mockEquipmentSet({
        name: 'Deep Sky Setup',
        description: 'Equipment for deep sky imaging',
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipmentSets: [testSet],
        })
      )

      render(<EquipmentManager />)

      // Switch to sets tab
      fireEvent.click(screen.getByRole('tab', { name: /sets/i }))

      expect(screen.getByText('Deep Sky Setup')).toBeInTheDocument()
      expect(screen.getByText('Equipment for deep sky imaging')).toBeInTheDocument()
    })

    it('should show create set button', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipmentSets: [],
        })
      )

      render(<EquipmentManager />)

      // Switch to sets tab
      fireEvent.click(screen.getByRole('tab', { name: /sets/i }))

      expect(screen.getByRole('button', { name: /create set/i })).toBeInTheDocument()
    })
  })

  describe('user interactions', () => {
    it('should close modal when close button is clicked', () => {
      const mockSetShowEquipmentManager = jest.fn()

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          setShowEquipmentManager: mockSetShowEquipmentManager,
        })
      )

      render(<EquipmentManager />)

      // Click the close button (X button)
      const closeButton = screen.getByRole('button', { name: '' })
      fireEvent.click(closeButton)

      expect(mockSetShowEquipmentManager).toHaveBeenCalledWith(false)
    })

    it('should update search query when search input changes', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      const searchInput = screen.getByPlaceholderText(/search equipment/i)
      fireEvent.change(searchInput, { target: { value: 'telescope' } })

      expect(searchInput).toHaveValue('telescope')
    })

    it('should switch tabs when tab buttons are clicked', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      // Equipment tab should be active by default
      expect(screen.getByRole('tab', { name: /equipment/i })).toHaveAttribute('data-state', 'active')

      // Click maintenance tab
      fireEvent.click(screen.getByRole('tab', { name: /maintenance/i }))
      expect(screen.getByRole('tab', { name: /maintenance/i })).toHaveAttribute('data-state', 'active')

      // Click sets tab
      fireEvent.click(screen.getByRole('tab', { name: /sets/i }))
      expect(screen.getByRole('tab', { name: /sets/i })).toHaveAttribute('data-state', 'active')
    })
  })

  describe('search functionality', () => {
    it('should filter equipment based on search query', () => {
      const telescope = mockEquipment({
        name: 'Seestar S50',
        type: 'telescope',
      })
      const camera = mockEquipment({
        name: 'Canon EOS',
        type: 'camera',
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipment: [telescope, camera],
        })
      )

      render(<EquipmentManager />)

      // Search for telescope
      const searchInput = screen.getByPlaceholderText(/search equipment/i)
      fireEvent.change(searchInput, { target: { value: 'seestar' } })

      expect(screen.getByText('Seestar S50')).toBeInTheDocument()
      expect(screen.queryByText('Canon EOS')).not.toBeInTheDocument()
    })
  })

  describe('equipment statistics', () => {
    it('should display equipment counts by type', () => {
      const telescope = mockEquipment({ type: 'telescope' })
      const camera = mockEquipment({ type: 'camera' })
      const filter = mockEquipment({ type: 'filter' })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipment: [telescope, camera, filter],
        })
      )

      render(<EquipmentManager />)

      // Should show equipment count
      expect(screen.getByText(/3 items/i)).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('should handle empty equipment list gracefully', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          equipment: [],
          maintenanceRecords: [],
          equipmentSets: [],
        })
      )

      render(<EquipmentManager />)

      expect(screen.getByText(/no equipment found/i)).toBeInTheDocument()
    })

    it('should handle maintenance records without matching equipment', () => {
      const orphanedMaintenance = mockMaintenanceRecord({
        equipmentId: 'non-existent',
        description: 'Orphaned maintenance',
      })

      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({
          showEquipmentManager: true,
          maintenanceRecords: [orphanedMaintenance],
          equipment: [],
        })
      )

      render(<EquipmentManager />)

      // Switch to maintenance tab
      fireEvent.click(screen.getByRole('tab', { name: /maintenance/i }))

      // Should still render without crashing
      expect(screen.getByText('Orphaned maintenance')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have proper modal structure with role', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have accessible tab navigation', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      expect(screen.getByRole('tablist')).toBeInTheDocument()
      expect(screen.getAllByRole('tab')).toHaveLength(3)
    })

    it('should have proper labels for search input', () => {
      mockUseTelescopeContext.mockReturnValue(
        createMockTelescopeContext({ showEquipmentManager: true })
      )

      render(<EquipmentManager />)

      expect(screen.getByPlaceholderText(/search equipment/i)).toBeInTheDocument()
    })
  })
})