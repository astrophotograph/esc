import {
  STORAGE_KEYS,
  CURRENT_DATA_VERSION,
  saveToStorage,
  loadFromStorage,
  isStorageAvailable,
  clearAllStoredData,
  getStorageUsage,
  exportStoredData,
  importStoredData,
} from '../storage-utils'

describe('storage-utils', () => {
  // Clear localStorage before each test
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
  })

  describe('saveToStorage', () => {
    it('should save data to localStorage', () => {
      const testData = { test: 'data', nested: { value: 123 } }
      const result = saveToStorage('test-key', testData)
      
      expect(result).toBe(true)
      expect(localStorage.getItem('test-key')).toBe(JSON.stringify(testData))
    })

    it('should handle saving null values', () => {
      const result = saveToStorage('test-key', null)
      
      expect(result).toBe(true)
      expect(localStorage.getItem('test-key')).toBe('null')
    })

    it('should handle saving arrays', () => {
      const testArray = [1, 2, 3, { nested: 'value' }]
      const result = saveToStorage('test-key', testArray)
      
      expect(result).toBe(true)
      expect(localStorage.getItem('test-key')).toBe(JSON.stringify(testArray))
    })

    it('should return false and log error on failure', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const mockError = new Error('Storage error')
      
      // Mock JSON.stringify to throw error
      const originalStringify = JSON.stringify
      JSON.stringify = jest.fn(() => {
        throw mockError
      })

      const result = saveToStorage('test-key', 'test-data')
      
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error saving data to localStorage (test-key):',
        mockError
      )
      
      JSON.stringify = originalStringify
      consoleSpy.mockRestore()
    })
  })

  describe('loadFromStorage', () => {
    it('should load data from localStorage', () => {
      const testData = { test: 'data', value: 42 }
      localStorage.setItem('test-key', JSON.stringify(testData))
      
      const result = loadFromStorage('test-key', {})
      
      expect(result).toEqual(testData)
    })

    it('should return default value when key does not exist', () => {
      const defaultValue = { default: 'value' }
      const result = loadFromStorage('non-existent-key', defaultValue)
      
      expect(result).toEqual(defaultValue)
    })

    it('should handle corrupted JSON and return default value', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const defaultValue = { default: 'value' }
      
      localStorage.setItem('test-key', 'invalid-json{')
      
      const result = loadFromStorage('test-key', defaultValue)
      
      expect(result).toEqual(defaultValue)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading data from localStorage (test-key):',
        expect.any(SyntaxError)
      )
      
      consoleSpy.mockRestore()
    })

    it('should handle null stored values', () => {
      localStorage.setItem('test-key', 'null')
      const result = loadFromStorage('test-key', 'default')
      
      expect(result).toBeNull()
    })
  })

  describe('isStorageAvailable', () => {
    it('should return true when localStorage is available', () => {
      const result = isStorageAvailable()
      expect(result).toBe(true)
    })

    it('should return false when localStorage throws error', () => {
      // Mock localStorage to not exist
      const originalLocalStorage = global.localStorage
      Object.defineProperty(global, 'localStorage', {
        get: jest.fn(() => {
          throw new Error('Storage not available')
        }),
        configurable: true,
      })

      const result = isStorageAvailable()
      
      expect(result).toBe(false)
      
      // Restore
      Object.defineProperty(global, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
      })
    })
  })

  describe('clearAllStoredData', () => {
    it('should clear all telescope data from localStorage', () => {
      // Add some data
      Object.values(STORAGE_KEYS).forEach((key, index) => {
        localStorage.setItem(key, `data-${index}`)
      })
      
      // Add non-telescope data
      localStorage.setItem('other-key', 'other-data')
      
      const result = clearAllStoredData()
      
      expect(result).toBe(true)
      
      // Check telescope keys are removed
      Object.values(STORAGE_KEYS).forEach((key) => {
        expect(localStorage.getItem(key)).toBeNull()
      })
      
      // Check other data remains
      expect(localStorage.getItem('other-key')).toBe('other-data')
    })

    it('should return false and log error on failure', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      // Mock Object.values to throw an error
      const originalValues = Object.values
      Object.values = jest.fn(() => {
        throw new Error('Remove error')
      })

      const result = clearAllStoredData()
      
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Error clearing stored data:', expect.any(Error))
      
      Object.values = originalValues
      consoleSpy.mockRestore()
    })
  })

  describe('getStorageUsage', () => {
    it('should calculate total storage usage in bytes', () => {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, 'test')
      localStorage.setItem(STORAGE_KEYS.OBSERVATIONS, 'longer-test-data')
      
      const result = getStorageUsage()
      
      // Each character is 2 bytes (UTF-16)
      const expectedSize = ('test'.length + 'longer-test-data'.length) * 2
      expect(result).toBe(expectedSize)
    })

    it('should return 0 for empty storage', () => {
      const result = getStorageUsage()
      expect(result).toBe(0)
    })

    it('should handle errors and return 0', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      // Mock Object.values to throw an error
      const originalValues = Object.values
      Object.values = jest.fn(() => {
        throw new Error('GetItem error')
      })

      const result = getStorageUsage()
      
      expect(result).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith('Error calculating storage usage:', expect.any(Error))
      
      Object.values = originalValues
      consoleSpy.mockRestore()
    })
  })

  describe('exportStoredData', () => {
    it('should export all stored data as JSON string', () => {
      const testData = {
        [STORAGE_KEYS.SETTINGS]: { theme: 'dark' },
        [STORAGE_KEYS.OBSERVATIONS]: [{ id: 1, target: 'M31' }],
      }
      
      // Store test data
      Object.entries(testData).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value))
      })
      
      const result = exportStoredData()
      const parsed = JSON.parse(result)
      
      expect(parsed.version).toBe(CURRENT_DATA_VERSION)
      expect(parsed.exportDate).toBeDefined()
      expect(new Date(parsed.exportDate).toISOString()).toBe(parsed.exportDate)
      expect(parsed.data[STORAGE_KEYS.SETTINGS]).toEqual({ theme: 'dark' })
      expect(parsed.data[STORAGE_KEYS.OBSERVATIONS]).toEqual([{ id: 1, target: 'M31' }])
    })

    it('should handle empty storage', () => {
      const result = exportStoredData()
      const parsed = JSON.parse(result)
      
      expect(parsed.version).toBe(CURRENT_DATA_VERSION)
      expect(parsed.data).toEqual({})
    })

    it('should handle corrupted data gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      localStorage.setItem(STORAGE_KEYS.SETTINGS, 'invalid-json{')
      localStorage.setItem(STORAGE_KEYS.OBSERVATIONS, JSON.stringify({ valid: 'data' }))
      
      const result = exportStoredData()
      const parsed = JSON.parse(result)
      
      // Should skip corrupted data but include valid data
      expect(parsed.data[STORAGE_KEYS.SETTINGS]).toBeUndefined()
      expect(parsed.data[STORAGE_KEYS.OBSERVATIONS]).toEqual({ valid: 'data' })
      expect(consoleSpy).toHaveBeenCalledWith(
        `Error exporting data for key ${STORAGE_KEYS.SETTINGS}:`,
        expect.any(SyntaxError)
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('importStoredData', () => {
    it('should import valid data successfully', () => {
      const importData = {
        version: CURRENT_DATA_VERSION,
        exportDate: new Date().toISOString(),
        data: {
          [STORAGE_KEYS.SETTINGS]: { theme: 'light' },
          [STORAGE_KEYS.OBSERVATIONS]: [{ id: 2, target: 'M42' }],
        },
      }
      
      const result = importStoredData(JSON.stringify(importData))
      
      expect(result).toBe(true)
      expect(localStorage.getItem(STORAGE_KEYS.SETTINGS)).toBe(
        JSON.stringify({ theme: 'light' })
      )
      expect(localStorage.getItem(STORAGE_KEYS.OBSERVATIONS)).toBe(
        JSON.stringify([{ id: 2, target: 'M42' }])
      )
    })

    it('should reject incompatible version', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      const importData = {
        version: CURRENT_DATA_VERSION + 1,
        data: { [STORAGE_KEYS.SETTINGS]: {} },
      }
      
      const result = importStoredData(JSON.stringify(importData))
      
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Incompatible data version')
      expect(localStorage.getItem(STORAGE_KEYS.SETTINGS)).toBeNull()
      
      consoleSpy.mockRestore()
    })

    it('should reject data without version', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      const importData = {
        data: { [STORAGE_KEYS.SETTINGS]: {} },
      }
      
      const result = importStoredData(JSON.stringify(importData))
      
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Incompatible data version')
      
      consoleSpy.mockRestore()
    })

    it('should ignore unknown keys', () => {
      const importData = {
        version: CURRENT_DATA_VERSION,
        data: {
          [STORAGE_KEYS.SETTINGS]: { theme: 'dark' },
          'unknown-key': { some: 'data' },
        },
      }
      
      const result = importStoredData(JSON.stringify(importData))
      
      expect(result).toBe(true)
      expect(localStorage.getItem(STORAGE_KEYS.SETTINGS)).toBe(
        JSON.stringify({ theme: 'dark' })
      )
      expect(localStorage.getItem('unknown-key')).toBeNull()
    })

    it('should handle invalid JSON', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      const result = importStoredData('invalid-json{')
      
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error importing data:',
        expect.any(SyntaxError)
      )
      
      consoleSpy.mockRestore()
    })

    it('should handle missing data property', () => {
      const importData = {
        version: CURRENT_DATA_VERSION,
        exportDate: new Date().toISOString(),
      }
      
      const result = importStoredData(JSON.stringify(importData))
      
      expect(result).toBe(true) // Should succeed even without data
    })
  })

  describe('STORAGE_KEYS', () => {
    it('should have all expected keys', () => {
      const expectedKeys = [
        'SETTINGS',
        'OBSERVATIONS',
        'SESSIONS',
        'PLANNED_SESSIONS',
        'LOCATIONS',
        'NOTIFICATION_SETTINGS',
        'NOTIFICATION_HISTORY',
        'CURRENT_LOCATION',
        'CURRENT_TELESCOPE',
        'UI_STATE',
        'VERSION',
      ]
      
      expectedKeys.forEach((key) => {
        expect(STORAGE_KEYS).toHaveProperty(key)
        expect(typeof STORAGE_KEYS[key as keyof typeof STORAGE_KEYS]).toBe('string')
      })
    })

    it('should have unique values', () => {
      const values = Object.values(STORAGE_KEYS)
      const uniqueValues = new Set(values)
      
      expect(values.length).toBe(uniqueValues.size)
    })
  })
})