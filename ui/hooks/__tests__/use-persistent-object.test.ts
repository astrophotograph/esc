import { renderHook, act } from '@testing-library/react'
import { usePersistentObject } from '../use-persistent-object'
import * as storageUtils from '../../utils/storage-utils'

// Mock storage utilities
jest.mock('../../utils/storage-utils')

describe('usePersistentObject', () => {
  const mockIsStorageAvailable = storageUtils.isStorageAvailable as jest.MockedFunction<typeof storageUtils.isStorageAvailable>
  const mockSaveToStorage = storageUtils.saveToStorage as jest.MockedFunction<typeof storageUtils.saveToStorage>
  const mockLoadFromStorage = storageUtils.loadFromStorage as jest.MockedFunction<typeof storageUtils.loadFromStorage>

  beforeEach(() => {
    jest.clearAllMocks()
    // Default mock implementations
    mockIsStorageAvailable.mockReturnValue(true)
    mockSaveToStorage.mockReturnValue(true)
  })

  describe('initialization', () => {
    it('should initialize with value from localStorage when available', () => {
      const storedObject = { name: 'John', age: 30, active: true }
      mockLoadFromStorage.mockReturnValue(storedObject)

      const { result } = renderHook(() => 
        usePersistentObject('user', { name: '', age: 0, active: false })
      )

      expect(mockIsStorageAvailable).toHaveBeenCalled()
      expect(mockLoadFromStorage).toHaveBeenCalledWith('user', { name: '', age: 0, active: false })
      expect(result.current[0]).toEqual(storedObject)
    })

    it('should initialize with default value when localStorage is empty', () => {
      const defaultObject = { settings: { theme: 'light', notifications: true } }
      mockLoadFromStorage.mockReturnValue(defaultObject)

      const { result } = renderHook(() => 
        usePersistentObject('settings', defaultObject)
      )

      expect(result.current[0]).toEqual(defaultObject)
    })

    it('should use default value when localStorage is not available', () => {
      mockIsStorageAvailable.mockReturnValue(false)
      const defaultObject = { config: { debug: false, version: '1.0' } }

      const { result } = renderHook(() => 
        usePersistentObject('config', defaultObject)
      )

      expect(mockLoadFromStorage).not.toHaveBeenCalled()
      expect(result.current[0]).toEqual(defaultObject)
    })
  })

  describe('object updates', () => {
    it('should update entire object and save to localStorage', () => {
      const initialObject = { name: 'John', age: 30 }
      mockLoadFromStorage.mockReturnValue(initialObject)
      
      const { result } = renderHook(() => 
        usePersistentObject('user', { name: '', age: 0 })
      )

      const updatedObject = { name: 'Jane', age: 25 }
      
      act(() => {
        result.current[1](updatedObject)
      })

      expect(result.current[0]).toEqual(updatedObject)
      expect(mockSaveToStorage).toHaveBeenCalledWith('user', updatedObject)
    })

    it('should handle function updates for entire object', () => {
      const initialObject = { count: 5, multiplier: 2 }
      mockLoadFromStorage.mockReturnValue(initialObject)
      
      const { result } = renderHook(() => 
        usePersistentObject('counter', { count: 0, multiplier: 1 })
      )

      act(() => {
        result.current[1](prev => ({ ...prev, count: prev.count * prev.multiplier }))
      })

      expect(result.current[0]).toEqual({ count: 10, multiplier: 2 })
      expect(mockSaveToStorage).toHaveBeenCalledWith('counter', { count: 10, multiplier: 2 })
    })

    it('should not save to localStorage when storage is not available', () => {
      mockIsStorageAvailable.mockReturnValue(false)
      
      const { result } = renderHook(() => 
        usePersistentObject('test', { value: 'initial' })
      )

      act(() => {
        result.current[1]({ value: 'updated' })
      })

      expect(result.current[0]).toEqual({ value: 'updated' })
      expect(mockSaveToStorage).not.toHaveBeenCalled()
    })
  })

  describe('property updates', () => {
    it('should update single property and save to localStorage', () => {
      const initialObject = { name: 'John', age: 30, active: true }
      mockLoadFromStorage.mockReturnValue(initialObject)
      
      const { result } = renderHook(() => 
        usePersistentObject('user', { name: '', age: 0, active: false })
      )

      act(() => {
        result.current[2]('age', 31)
      })

      expect(result.current[0]).toEqual({ name: 'John', age: 31, active: true })
      expect(mockSaveToStorage).toHaveBeenCalledWith('user', { name: 'John', age: 31, active: true })
    })

    it('should update multiple properties independently', () => {
      const initialObject = { x: 10, y: 20, z: 30 }
      mockLoadFromStorage.mockReturnValue(initialObject)
      
      const { result } = renderHook(() => 
        usePersistentObject('coordinates', { x: 0, y: 0, z: 0 })
      )

      act(() => {
        result.current[2]('x', 15)
      })

      expect(result.current[0]).toEqual({ x: 15, y: 20, z: 30 })

      act(() => {
        result.current[2]('z', 35)
      })

      expect(result.current[0]).toEqual({ x: 15, y: 20, z: 35 })
      expect(mockSaveToStorage).toHaveBeenLastCalledWith('coordinates', { x: 15, y: 20, z: 35 })
    })

    it('should handle property updates with complex values', () => {
      const initialObject = {
        user: { name: 'John', email: 'john@example.com' },
        settings: { theme: 'dark', notifications: true },
        preferences: ['setting1', 'setting2']
      }
      mockLoadFromStorage.mockReturnValue(initialObject)
      
      const { result } = renderHook(() => 
        usePersistentObject('app-state', {
          user: { name: '', email: '' },
          settings: { theme: 'light', notifications: false },
          preferences: [] as string[]
        })
      )

      const newUserData = { name: 'Jane', email: 'jane@example.com' }
      
      act(() => {
        result.current[2]('user', newUserData)
      })

      expect(result.current[0].user).toEqual(newUserData)
      expect(result.current[0].settings).toEqual({ theme: 'dark', notifications: true })
      expect(mockSaveToStorage).toHaveBeenCalledWith('app-state', {
        user: newUserData,
        settings: { theme: 'dark', notifications: true },
        preferences: ['setting1', 'setting2']
      })
    })
  })

  describe('nested object handling', () => {
    it('should handle deeply nested objects', () => {
      const initialObject = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      }
      mockLoadFromStorage.mockReturnValue(initialObject)
      
      const { result } = renderHook(() => 
        usePersistentObject('nested', {
          level1: { level2: { level3: { value: '' } } }
        })
      )

      const newLevel1 = {
        level2: {
          level3: {
            value: 'updated deep value'
          }
        }
      }
      
      act(() => {
        result.current[2]('level1', newLevel1)
      })

      expect(result.current[0].level1).toEqual(newLevel1)
    })
  })

  describe('callback stability', () => {
    it('should have stable callback references', () => {
      const { result, rerender } = renderHook(() => 
        usePersistentObject('test', { value: 'initial' })
      )

      const initialSetState = result.current[1]
      const initialUpdateProperty = result.current[2]

      rerender()

      expect(result.current[1]).toBe(initialSetState)
      expect(result.current[2]).toBe(initialUpdateProperty)
    })
  })

  describe('error handling', () => {
    it('should continue working if save fails', () => {
      mockSaveToStorage.mockReturnValue(false)
      mockLoadFromStorage.mockReturnValue({ value: 'initial' })
      
      const { result } = renderHook(() => 
        usePersistentObject('test', { value: 'default' })
      )

      act(() => {
        result.current[2]('value', 'updated')
      })

      // State should still update even if save fails
      expect(result.current[0]).toEqual({ value: 'updated' })
      expect(mockSaveToStorage).toHaveBeenCalledWith('test', { value: 'updated' })
    })
  })

  describe('type safety', () => {
    it('should maintain type safety for object properties', () => {
      interface TestConfig {
        debug: boolean
        maxRetries: number
        endpoints: string[]
        metadata: Record<string, any>
      }

      const defaultConfig: TestConfig = {
        debug: false,
        maxRetries: 3,
        endpoints: [],
        metadata: {}
      }

      mockLoadFromStorage.mockReturnValue(defaultConfig)
      
      const { result } = renderHook(() => 
        usePersistentObject<TestConfig>('config', defaultConfig)
      )

      act(() => {
        result.current[2]('debug', true)
        result.current[2]('maxRetries', 5)
        result.current[2]('endpoints', ['api.example.com'])
      })

      expect(result.current[0]).toEqual({
        debug: true,
        maxRetries: 5,
        endpoints: ['api.example.com'],
        metadata: {}
      })
    })
  })

  describe('concurrent property updates', () => {
    it('should handle multiple property updates in sequence', () => {
      mockLoadFromStorage.mockReturnValue({ a: 1, b: 2, c: 3 })
      
      const { result } = renderHook(() => 
        usePersistentObject('multi', { a: 0, b: 0, c: 0 })
      )

      act(() => {
        result.current[2]('a', 10)
        result.current[2]('b', 20)
        result.current[2]('c', 30)
      })

      expect(result.current[0]).toEqual({ a: 10, b: 20, c: 30 })
      expect(mockSaveToStorage).toHaveBeenLastCalledWith('multi', { a: 10, b: 20, c: 30 })
    })
  })

  describe('key changes', () => {
    it('should save to new key when key changes', () => {
      mockLoadFromStorage.mockReturnValue({ value: 'initial' })
      
      const { result, rerender } = renderHook(
        ({ key }) => usePersistentObject(key, { value: 'default' }),
        { initialProps: { key: 'key1' } }
      )

      act(() => {
        result.current[2]('value', 'updated')
      })
      
      expect(mockSaveToStorage).toHaveBeenCalledWith('key1', { value: 'updated' })

      // Change the key
      rerender({ key: 'key2' })

      // The hook will save to the new key
      expect(mockSaveToStorage).toHaveBeenLastCalledWith('key2', { value: 'updated' })
    })
  })
})