import React from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { createMockTelescopeContext, mockTelescope, mockEquipment } from '../../test-utils'

// Import components for integration testing
import { SessionManagement } from '@/components/telescope/panels/SessionManagement'
import { ObservationLogger } from '@/components/telescope/panels/ObservationLogger'
import { EquipmentManager } from "@/components/telescope/modals/EquipmentManager"

// Mock storage utilities for data persistence testing
const mockSaveToStorage = jest.fn()
const mockLoadFromStorage = jest.fn()

jest.mock('../../utils/storage-utils', () => ({
  STORAGE_KEYS: {
    EQUIPMENT_LIST: 'equipment-list',
    EQUIPMENT_USAGE: 'equipment-usage',
    MAINTENANCE_ALERTS: 'maintenance-alerts',
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

// Mock equipment utility functions inline
const mockCalculateMaintenanceScore = jest.fn((equipment) => {
  if (equipment.usageHours > 1000) return 25 // Needs maintenance
  if (equipment.usageHours > 500) return 75 // Good condition
  return 95 // Excellent condition
})

const mockGetMaintenanceRecommendation = jest.fn((score) => {
  if (score < 50) return 'Maintenance Required'
  if (score < 80) return 'Service Soon'
  return 'Good Condition'
})

const mockCheckEquipmentCompatibility = jest.fn((equipment1, equipment2) => {
  // Mock compatibility logic
  const incompatiblePairs = [
    ['UV Filter', 'IR Filter'], // Can't use both simultaneously
    ['2" Eyepiece', '1.25" Eyepiece'], // Different sizes
  ]

  return !incompatiblePairs.some(([item1, item2]) =>
    (equipment1.name === item1 && equipment2.name === item2) ||
    (equipment1.name === item2 && equipment2.name === item1)
  )
})

const mockFormatUsageTime = jest.fn((hours) => {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 24) return `${hours.toFixed(1)} hrs`
  return `${Math.round(hours / 24)} days`
})

describe('Equipment Management Flow Integration Tests', () => {
  const mockTelescope1 = mockTelescope({
    id: 'telescope-1',
    name: 'Seestar S50',
    serial_number: 'SS50001',
  })

  const mockEquipmentList = [
    mockEquipment({
      id: 'eq-1',
      name: 'UV/IR Cut Filter',
      type: 'filter',
      usageHours: 250,
      maintenanceHistory: [],
    }),
    mockEquipment({
      id: 'eq-2',
      name: '2" Eyepiece',
      type: 'eyepiece',
      usageHours: 800,
      maintenanceHistory: [],
    }),
    mockEquipment({
      id: 'eq-3',
      name: 'Focuser Motor',
      type: 'motor',
      usageHours: 1200,
      maintenanceHistory: [
        {
          date: '2024-01-15',
          type: 'cleaning',
          notes: 'Routine cleaning performed',
          cost: 0,
        },
      ],
    }),
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockLoadFromStorage.mockReturnValue([])
  })

  describe('Complete Equipment Management Workflow', () => {
    it('should complete full equipment flow: add equipment → track usage → trigger maintenance alerts', async () => {
      const mockAddEquipment = jest.fn()
      const mockUpdateEquipmentUsage = jest.fn()
      const mockAddMaintenanceRecord = jest.fn()
      const mockSetEquipmentList = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: [],
        addEquipment: mockAddEquipment,
        updateEquipmentUsage: mockUpdateEquipmentUsage,
        addMaintenanceRecord: mockAddMaintenanceRecord,
        setEquipmentList: mockSetEquipmentList,
        maintenanceAlerts: [],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // 1. Add New Equipment
      render(<EquipmentManager />)

      const addEquipmentButton = screen.getByRole('button', { name: /add equipment/i })
      fireEvent.click(addEquipmentButton)

      // Fill equipment form (assuming modal opens)
      const nameInput = screen.getByPlaceholderText(/equipment name/i)
      const typeSelect = screen.getByRole('combobox', { name: /type/i })

      fireEvent.change(nameInput, { target: { value: 'New UV Filter' } })
      fireEvent.change(typeSelect, { target: { value: 'filter' } })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      expect(mockAddEquipment).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New UV Filter',
        type: 'filter',
        usageHours: 0,
      }))

      // 2. Update context with new equipment
      const updatedContextValue = {
        ...contextValue,
        equipmentList: [
          ...mockEquipmentList,
          {
            id: 'eq-new',
            name: 'New UV Filter',
            type: 'filter',
            usageHours: 0,
            maintenanceHistory: [],
          },
        ],
      }

      mockUseTelescopeContext.mockReturnValue(updatedContextValue)

      // 3. Start session with equipment tracking
      render(<SessionManagement />)

      const startSessionButton = screen.getByRole('button', { name: /start session/i })
      fireEvent.click(startSessionButton)

      // 4. Track usage during session
      // Simulate equipment usage tracking
      expect(mockUpdateEquipmentUsage).toHaveBeenCalled()

      // 5. Check maintenance alerts for high-usage equipment
      render(<EquipmentManager />)

      // Should show maintenance alert for equipment with high usage
      expect(screen.getByText(/maintenance required/i)).toBeInTheDocument()

      // 6. Verify data persistence
      await waitFor(() => {
        expect(mockSaveToStorage).toHaveBeenCalledWith(
          'equipment-list',
          expect.any(Array)
        )
      })
    })

    it('should handle equipment compatibility checking in observation planning', async () => {
      const mockCheckCompatibility = jest.fn()
      const mockSelectEquipment = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
        selectedEquipment: [],
        selectEquipment: mockSelectEquipment,
        checkCompatibility: mockCheckCompatibility,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // Select first piece of equipment
      const firstEquipmentCheckbox = screen.getAllByRole('checkbox')[0]
      fireEvent.click(firstEquipmentCheckbox)

      expect(mockSelectEquipment).toHaveBeenCalled()

      // Select second piece of equipment
      const secondEquipmentCheckbox = screen.getAllByRole('checkbox')[1]
      fireEvent.click(secondEquipmentCheckbox)

      // Should check compatibility
      expect(mockCheckCompatibility).toHaveBeenCalled()

      // Verify compatibility warning appears if incompatible
      const contextWithIncompatibleEquipment = {
        ...contextValue,
        selectedEquipment: [mockEquipmentList[0], mockEquipmentList[1]],
        compatibilityWarnings: ['UV Filter and 2" Eyepiece may not be compatible'],
      }

      mockUseTelescopeContext.mockReturnValue(contextWithIncompatibleEquipment)

      const { rerender } = render(<EquipmentManager />)
      rerender(<EquipmentManager />)

      expect(screen.getByText(/may not be compatible/i)).toBeInTheDocument()
    })

    it('should maintain equipment data integrity across sessions', async () => {
      const persistedEquipmentData = [
        {
          id: 'eq-persisted',
          name: 'Persisted Filter',
          type: 'filter',
          usageHours: 500,
          maintenanceHistory: [
            {
              date: '2024-01-01',
              type: 'calibration',
              notes: 'Initial setup',
              cost: 50,
            },
          ],
        },
      ]

      mockLoadFromStorage.mockReturnValue(persistedEquipmentData)

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: persistedEquipmentData,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // Verify persisted data is loaded
      expect(mockLoadFromStorage).toHaveBeenCalledWith('equipment-list', [])
      expect(screen.getByText('Persisted Filter')).toBeInTheDocument()
      expect(screen.getByText('500')).toBeInTheDocument() // Usage hours

      // Verify maintenance history is preserved
      const maintenanceButton = screen.getByRole('button', { name: /maintenance history/i })
      fireEvent.click(maintenanceButton)

      expect(screen.getByText('Initial setup')).toBeInTheDocument()
      expect(screen.getByText('$50')).toBeInTheDocument()
    })
  })

  describe('Equipment Usage Tracking', () => {
    it('should track equipment usage during active sessions', async () => {
      const mockUpdateEquipmentUsage = jest.fn()
      const mockStartSession = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
        selectedEquipment: [mockEquipmentList[0]],
        updateEquipmentUsage: mockUpdateEquipmentUsage,
        startSession: mockStartSession,
        activeSession: null,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Start session with selected equipment
      render(<SessionManagement />)

      const startButton = screen.getByRole('button', { name: /start session/i })
      fireEvent.click(startButton)

      expect(mockStartSession).toHaveBeenCalled()

      // Update context to simulate active session
      const activeSessionContext = {
        ...contextValue,
        activeSession: {
          id: 'session-1',
          name: 'Equipment Tracking Session',
          startTime: new Date().toISOString(),
          endTime: null,
          equipment: ['eq-1'],
          observations: [],
          totalObservingTime: 0,
          notes: '',
        },
      }

      mockUseTelescopeContext.mockReturnValue(activeSessionContext)

      // Simulate session running for some time
      // In real implementation, this would be handled by the session timer
      expect(mockUpdateEquipmentUsage).toHaveBeenCalled()
    })

    it('should calculate accurate usage statistics', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // Verify usage statistics are displayed correctly
      expect(screen.getByText('250')).toBeInTheDocument() // UV Filter usage
      expect(screen.getByText('800')).toBeInTheDocument() // Eyepiece usage
      expect(screen.getByText('1200')).toBeInTheDocument() // Motor usage
    })

    it('should handle equipment with zero usage hours', () => {
      const newEquipment = mockEquipment({
        id: 'eq-new',
        name: 'Brand New Filter',
        type: 'filter',
        usageHours: 0,
        maintenanceHistory: [],
      })

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: [newEquipment],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      expect(screen.getByText('Brand New Filter')).toBeInTheDocument()
      expect(screen.getByText('0')).toBeInTheDocument() // Zero usage hours
    })
  })

  describe('Maintenance Alert System', () => {
    it('should generate maintenance alerts for high-usage equipment', () => {
      const highUsageEquipment = mockEquipment({
        id: 'eq-high-usage',
        name: 'High Usage Motor',
        type: 'motor',
        usageHours: 1500, // Above maintenance threshold
        maintenanceHistory: [],
      })

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: [highUsageEquipment],
        maintenanceAlerts: [
          {
            equipmentId: 'eq-high-usage',
            severity: 'high',
            message: 'Maintenance Required',
            recommendedAction: 'Schedule professional service',
          },
        ],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      expect(screen.getByText('Maintenance Required')).toBeInTheDocument()
      expect(screen.getByText('Schedule professional service')).toBeInTheDocument()
    })

    it('should prioritize maintenance alerts by severity', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
        maintenanceAlerts: [
          {
            equipmentId: 'eq-1',
            severity: 'low',
            message: 'Service Soon',
            recommendedAction: 'Plan maintenance in next month',
          },
          {
            equipmentId: 'eq-3',
            severity: 'high',
            message: 'Maintenance Required',
            recommendedAction: 'Stop using until serviced',
          },
        ],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // High severity alerts should appear first
      const alerts = screen.getAllByText(/maintenance|service/i)
      expect(alerts[0]).toHaveTextContent('Maintenance Required')
    })

    it('should update maintenance alerts when equipment is serviced', async () => {
      const mockAddMaintenanceRecord = jest.fn()
      const mockClearMaintenanceAlert = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: [mockEquipmentList[2]], // High usage motor
        addMaintenanceRecord: mockAddMaintenanceRecord,
        clearMaintenanceAlert: mockClearMaintenanceAlert,
        maintenanceAlerts: [
          {
            equipmentId: 'eq-3',
            severity: 'high',
            message: 'Maintenance Required',
            recommendedAction: 'Schedule professional service',
          },
        ],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // Add maintenance record
      const addMaintenanceButton = screen.getByRole('button', { name: /add maintenance/i })
      fireEvent.click(addMaintenanceButton)

      const maintenanceTypeSelect = screen.getByRole('combobox', { name: /maintenance type/i })
      const maintenanceNotes = screen.getByPlaceholderText(/maintenance notes/i)

      fireEvent.change(maintenanceTypeSelect, { target: { value: 'service' } })
      fireEvent.change(maintenanceNotes, { target: { value: 'Professional service completed' } })

      const saveMaintenanceButton = screen.getByRole('button', { name: /save maintenance/i })
      fireEvent.click(saveMaintenanceButton)

      expect(mockAddMaintenanceRecord).toHaveBeenCalledWith('eq-3', expect.objectContaining({
        type: 'service',
        notes: 'Professional service completed',
      }))

      // Alert should be cleared after maintenance
      expect(mockClearMaintenanceAlert).toHaveBeenCalledWith('eq-3')
    })
  })

  describe('Equipment Compatibility System', () => {
    it('should detect incompatible equipment combinations', () => {
      const incompatibleEquipment = [
        mockEquipment({
          id: 'eq-uv',
          name: 'UV Filter',
          type: 'filter',
          usageHours: 100,
        }),
        mockEquipment({
          id: 'eq-ir',
          name: 'IR Filter',
          type: 'filter',
          usageHours: 50,
        }),
      ]

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: incompatibleEquipment,
        selectedEquipment: incompatibleEquipment,
        compatibilityWarnings: ['UV Filter and IR Filter cannot be used simultaneously'],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      expect(screen.getByText(/cannot be used simultaneously/i)).toBeInTheDocument()
    })

    it('should suggest compatible equipment alternatives', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
        selectedEquipment: [mockEquipmentList[0]], // UV Filter
        compatibilitySuggestions: [
          'Consider using a Dual-Band Filter instead of separate UV and IR filters',
          '1.25" Eyepiece recommended for this telescope model',
        ],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      expect(screen.getByText(/dual-band filter/i)).toBeInTheDocument()
      expect(screen.getByText(/1.25" eyepiece recommended/i)).toBeInTheDocument()
    })

    it('should validate equipment compatibility in observation planning', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
        selectedEquipment: [mockEquipmentList[0], mockEquipmentList[1]],
        planningMode: true,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Render observation logger to test planning integration
      render(<ObservationLogger />)

      // Should show equipment compatibility status in planning
      expect(screen.getByText(/equipment selected/i)).toBeInTheDocument()
    })
  })

  describe('Data Persistence and Recovery', () => {
    it('should recover equipment data after application restart', () => {
      const persistedData = {
        equipmentList: mockEquipmentList,
        maintenanceAlerts: [
          {
            equipmentId: 'eq-3',
            severity: 'medium',
            message: 'Service recommended',
          },
        ],
        usageStatistics: {
          totalHours: 2250,
          mostUsedEquipment: 'eq-3',
        },
      }

      mockLoadFromStorage.mockImplementation((key) => {
        if (key === 'equipment-list') return persistedData.equipmentList
        if (key === 'maintenance-alerts') return persistedData.maintenanceAlerts
        if (key === 'equipment-usage') return persistedData.usageStatistics
        return []
      })

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: persistedData.equipmentList,
        maintenanceAlerts: persistedData.maintenanceAlerts,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // Verify all persisted data is loaded
      expect(mockLoadFromStorage).toHaveBeenCalledWith('equipment-list', [])
      expect(mockLoadFromStorage).toHaveBeenCalledWith('maintenance-alerts', [])
      expect(mockLoadFromStorage).toHaveBeenCalledWith('equipment-usage', [])

      // Verify equipment list is displayed
      expect(screen.getByText('UV/IR Cut Filter')).toBeInTheDocument()
      expect(screen.getByText('2" Eyepiece')).toBeInTheDocument()
      expect(screen.getByText('Focuser Motor')).toBeInTheDocument()

      // Verify maintenance alerts are displayed
      expect(screen.getByText('Service recommended')).toBeInTheDocument()
    })

    it('should handle corrupted equipment data gracefully', () => {
      mockLoadFromStorage.mockImplementation(() => {
        throw new Error('Corrupted equipment data')
      })

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: [], // Fallback to empty list
        maintenanceAlerts: [],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      // Should not crash when data is corrupted
      expect(() => render(<EquipmentManager />)).not.toThrow()

      // Should show empty state
      expect(screen.getByText(/no equipment/i)).toBeInTheDocument()
    })

    it('should validate equipment data integrity on load', () => {
      const invalidEquipmentData = [
        {
          // Missing required fields
          id: 'eq-invalid',
          name: 'Invalid Equipment',
          // Missing type, usageHours
        },
        {
          id: 'eq-valid',
          name: 'Valid Equipment',
          type: 'filter',
          usageHours: 100,
          maintenanceHistory: [],
        },
      ]

      mockLoadFromStorage.mockReturnValue(invalidEquipmentData)

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: [invalidEquipmentData[1]], // Only valid equipment
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // Should only display valid equipment
      expect(screen.getByText('Valid Equipment')).toBeInTheDocument()
      expect(screen.queryByText('Invalid Equipment')).not.toBeInTheDocument()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle equipment operations when no telescope is connected', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: null,
        equipmentList: mockEquipmentList,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      expect(() => render(<EquipmentManager />)).not.toThrow()

      // Should show equipment list but disable telescope-specific features
      expect(screen.getByText('UV/IR Cut Filter')).toBeInTheDocument()
    })

    it('should handle missing equipment handlers gracefully', () => {
      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
        addEquipment: undefined,
        updateEquipmentUsage: undefined,
        addMaintenanceRecord: undefined,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      expect(() => render(<EquipmentManager />)).not.toThrow()

      // Buttons should be disabled or hidden when handlers are missing
      const addButton = screen.queryByRole('button', { name: /add equipment/i })
      expect(addButton).toBeDisabled()
    })

    it('should handle rapid equipment selection changes', () => {
      const mockSelectEquipment = jest.fn()

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: mockEquipmentList,
        selectedEquipment: [],
        selectEquipment: mockSelectEquipment,
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      render(<EquipmentManager />)

      // Rapid equipment selection
      const checkboxes = screen.getAllByRole('checkbox')

      checkboxes.forEach((checkbox, index) => {
        fireEvent.click(checkbox)
        fireEvent.click(checkbox) // Unselect
        fireEvent.click(checkbox) // Select again
      })

      // Should handle all interactions without errors
      expect(mockSelectEquipment).toHaveBeenCalledTimes(checkboxes.length * 3)
    })

    it('should handle equipment with invalid maintenance history', () => {
      const equipmentWithInvalidHistory = mockEquipment({
        id: 'eq-invalid-history',
        name: 'Equipment with Invalid History',
        type: 'motor',
        usageHours: 500,
        maintenanceHistory: [
          {
            // Missing required fields
            date: '2024-01-01',
            // Missing type, notes
          },
          {
            date: 'invalid-date',
            type: 'cleaning',
            notes: 'Valid record',
            cost: 25,
          },
        ],
      })

      const contextValue = createMockTelescopeContext({
        currentTelescope: mockTelescope1,
        equipmentList: [equipmentWithInvalidHistory],
      })

      mockUseTelescopeContext.mockReturnValue(contextValue)

      expect(() => render(<EquipmentManager />)).not.toThrow()

      // Should display equipment but handle invalid history gracefully
      expect(screen.getByText('Equipment with Invalid History')).toBeInTheDocument()
    })
  })
})
