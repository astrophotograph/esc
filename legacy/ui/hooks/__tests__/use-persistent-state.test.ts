import { renderHook, act } from '@testing-library/react'
import { usePersistentState } from '../use-persistent-state'
import * as storageUtils from '../../utils/storage-utils'

// Mock storage utilities
jest.mock('../../utils/storage-utils')

describe('usePersistentState', () => {
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
      const storedValue = { theme: 'dark', fontSize: 16 }
      mockLoadFromStorage.mockReturnValue(storedValue)

      const { result } = renderHook(() => 
        usePersistentState('test-key', { theme: 'light', fontSize: 14 })
      )

      expect(mockIsStorageAvailable).toHaveBeenCalled()
      expect(mockLoadFromStorage).toHaveBeenCalledWith('test-key', { theme: 'light', fontSize: 14 })
      expect(result.current[0]).toEqual(storedValue)
    })

    it('should initialize with default value when localStorage is empty', () => {
      const defaultValue = { theme: 'light', fontSize: 14 }
      mockLoadFromStorage.mockReturnValue(defaultValue)

      const { result } = renderHook(() => 
        usePersistentState('test-key', defaultValue)
      )

      expect(result.current[0]).toEqual(defaultValue)
    })

    it('should use default value when localStorage is not available', () => {
      mockIsStorageAvailable.mockReturnValue(false)
      const defaultValue = 'default-value'

      const { result } = renderHook(() => 
        usePersistentState('test-key', defaultValue)
      )

      expect(mockLoadFromStorage).not.toHaveBeenCalled()
      expect(result.current[0]).toBe(defaultValue)
    })
  })

  describe('state updates', () => {
    it('should update state and save to localStorage', () => {
      mockLoadFromStorage.mockReturnValue('initial')
      
      const { result } = renderHook(() => 
        usePersistentState('test-key', 'default')
      )

      act(() => {
        result.current[1]('updated')
      })

      expect(result.current[0]).toBe('updated')
      expect(mockSaveToStorage).toHaveBeenCalledWith('test-key', 'updated')
    })

    it('should handle function updates', () => {
      mockLoadFromStorage.mockReturnValue(10)
      
      const { result } = renderHook(() => 
        usePersistentState('counter', 0)
      )

      act(() => {
        result.current[1](prev => prev + 5)
      })

      expect(result.current[0]).toBe(15)
      expect(mockSaveToStorage).toHaveBeenCalledWith('counter', 15)
    })

    it('should not save to localStorage when storage is not available', () => {
      mockIsStorageAvailable.mockReturnValue(false)
      
      const { result } = renderHook(() => 
        usePersistentState('test-key', 'default')
      )

      act(() => {
        result.current[1]('updated')
      })

      expect(result.current[0]).toBe('updated')
      expect(mockSaveToStorage).not.toHaveBeenCalled()
    })
  })

  describe('complex data types', () => {
    it('should handle objects', () => {
      const initialObject = { name: 'John', age: 30 }
      mockLoadFromStorage.mockReturnValue(initialObject)
      
      const { result } = renderHook(() => 
        usePersistentState('user', { name: '', age: 0 })
      )

      expect(result.current[0]).toEqual(initialObject)

      act(() => {
        result.current[1]({ name: 'Jane', age: 25 })
      })

      expect(mockSaveToStorage).toHaveBeenCalledWith('user', { name: 'Jane', age: 25 })
    })

    it('should handle arrays', () => {
      const initialArray = [1, 2, 3, 4, 5]
      mockLoadFromStorage.mockReturnValue(initialArray)
      
      const { result } = renderHook(() => 
        usePersistentState('numbers', [] as number[])
      )

      expect(result.current[0]).toEqual(initialArray)

      act(() => {
        result.current[1]([...result.current[0], 6])
      })

      expect(mockSaveToStorage).toHaveBeenCalledWith('numbers', [1, 2, 3, 4, 5, 6])
    })

    it('should handle null values', () => {
      mockLoadFromStorage.mockReturnValue(null)
      
      const { result } = renderHook(() => 
        usePersistentState<string | null>('nullable', 'default')
      )

      expect(result.current[0]).toBeNull()

      act(() => {
        result.current[1]('not null')
      })

      expect(mockSaveToStorage).toHaveBeenCalledWith('nullable', 'not null')
    })
  })

  describe('key changes', () => {
    it('should save to new key when key changes', () => {
      mockLoadFromStorage.mockReturnValue('value1')
      
      const { result, rerender } = renderHook(
        ({ key }) => usePersistentState(key, 'default'),
        { initialProps: { key: 'key1' } }
      )

      expect(result.current[0]).toBe('value1')
      
      // Update the value
      act(() => {
        result.current[1]('updated-value')
      })
      
      expect(mockSaveToStorage).toHaveBeenCalledWith('key1', 'updated-value')

      // Change the key
      rerender({ key: 'key2' })

      // The hook will save to the new key on next update
      expect(mockSaveToStorage).toHaveBeenLastCalledWith('key2', 'updated-value')
    })
  })

  describe('concurrent updates', () => {
    it('should handle multiple rapid updates', () => {
      mockLoadFromStorage.mockReturnValue(0)
      
      const { result } = renderHook(() => 
        usePersistentState('counter', 0)
      )

      act(() => {
        result.current[1](1)
        result.current[1](2)
        result.current[1](3)
      })

      expect(result.current[0]).toBe(3)
      // Due to batching, might be called fewer times than updates
      expect(mockSaveToStorage).toHaveBeenLastCalledWith('counter', 3)
    })
  })

  describe('error handling', () => {
    it('should continue working if save fails', () => {
      mockSaveToStorage.mockReturnValue(false)
      mockLoadFromStorage.mockReturnValue('initial')
      
      const { result } = renderHook(() => 
        usePersistentState('test-key', 'default')
      )

      act(() => {
        result.current[1]('updated')
      })

      // State should still update even if save fails
      expect(result.current[0]).toBe('updated')
      expect(mockSaveToStorage).toHaveBeenCalledWith('test-key', 'updated')
    })
  })

  describe('type safety', () => {
    it('should maintain type safety for primitives', () => {
      mockLoadFromStorage.mockReturnValue(42)
      
      const { result } = renderHook(() => 
        usePersistentState<number>('typed-number', 0)
      )

      // TypeScript should enforce number type
      expect(typeof result.current[0]).toBe('number')
      
      act(() => {
        result.current[1](100)
      })

      expect(result.current[0]).toBe(100)
    })

    it('should maintain type safety for complex types', () => {
      interface User {
        id: number
        name: string
        email: string
      }

      const initialUser: User = { id: 1, name: 'Test', email: 'test@example.com' }
      mockLoadFromStorage.mockReturnValue(initialUser)
      
      const { result } = renderHook(() => 
        usePersistentState<User>('user', { id: 0, name: '', email: '' })
      )

      expect(result.current[0]).toEqual(initialUser)
      
      act(() => {
        result.current[1]({ id: 2, name: 'Updated', email: 'updated@example.com' })
      })

      expect(mockSaveToStorage).toHaveBeenCalledWith('user', {
        id: 2,
        name: 'Updated',
        email: 'updated@example.com'
      })
    })
  })
})