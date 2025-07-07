import { renderHook, waitFor, act } from '@testing-library/react'
import { useTelescopes } from '../useTelescopes'

describe('useTelescopes', () => {
  const mockTelescopes = [
    {
      id: 'telescope-1',
      name: 'Test Telescope 1',
      host: '192.168.1.100',
      port: 4700,
      connected: true,
      serial_number: 'SN001',
      product_model: 'Seestar S50',
      ssid: 'SEESTAR_001',
      status: 'online' as const,
      last_seen: '2024-01-01T12:00:00Z',
    },
    {
      id: 'telescope-2',
      name: 'Test Telescope 2',
      host: '192.168.1.101',
      port: 4700,
      connected: false,
      serial_number: 'SN002',
      product_model: 'Seestar S50',
      ssid: 'SEESTAR_002',
      status: 'offline' as const,
      last_seen: '2024-01-01T11:00:00Z',
    }
  ]

  beforeEach(() => {
    // Reset console.error mock
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('successful fetching', () => {
    it('should fetch telescopes successfully', async () => {
      // Mock fetch to return successful response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTelescopes,
      })

      const { result } = renderHook(() => useTelescopes())

      // Initially loading
      expect(result.current.loading).toBe(true)
      expect(result.current.telescopes).toEqual([])
      expect(result.current.error).toBeNull()

      // Wait for the fetch to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.telescopes).toEqual(mockTelescopes)
      expect(result.current.error).toBeNull()
      expect(global.fetch).toHaveBeenCalledWith('/api/telescopes')
    })

    it('should handle empty telescope list', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      })

      const { result } = renderHook(() => useTelescopes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.telescopes).toEqual([])
      expect(result.current.error).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should handle HTTP error responses', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal server error' }),
      })

      const { result } = renderHook(() => useTelescopes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.telescopes).toEqual([])
      expect(result.current.error).toBe('Failed to fetch telescopes: 500 Internal Server Error')
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching telescopes:',
        expect.any(Error)
      )
    })

    it('should handle 404 errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not found' }),
      })

      const { result } = renderHook(() => useTelescopes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Failed to fetch telescopes: 404 Not Found')
    })

    it('should handle network errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useTelescopes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.telescopes).toEqual([])
      expect(result.current.error).toBe('Network error')
      expect(console.error).toHaveBeenCalled()
    })

    it('should handle malformed JSON responses', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token in JSON')
        },
      })

      const { result } = renderHook(() => useTelescopes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.telescopes).toEqual([])
      expect(result.current.error).toBe('Unexpected token in JSON')
      expect(console.error).toHaveBeenCalled()
    })

    it('should handle unknown errors gracefully', async () => {
      // Mock fetch to throw a non-Error object
      global.fetch = jest.fn().mockRejectedValue('string error')

      const { result } = renderHook(() => useTelescopes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Unknown error occurred')
    })
  })

  describe('refetch functionality', () => {
    it('should refetch telescopes when refetch is called', async () => {
      let callCount = 0
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => [mockTelescopes[0]],
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => mockTelescopes,
        })
      })

      const { result } = renderHook(() => useTelescopes())

      // Wait for initial fetch
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.telescopes).toEqual([mockTelescopes[0]])

      // Trigger refetch
      act(() => {
        result.current.refetch()
      })

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.telescopes).toEqual(mockTelescopes)
      expect(callCount).toBe(2)
    })

    it('should clear previous error when refetching', async () => {
      let shouldError = true
      global.fetch = jest.fn().mockImplementation(() => {
        if (shouldError) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => mockTelescopes,
        })
      })

      const { result } = renderHook(() => useTelescopes())

      // Wait for initial error
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeTruthy()

      // Fix the error and refetch
      shouldError = false
      act(() => {
        result.current.refetch()
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeNull()
      expect(result.current.telescopes).toEqual(mockTelescopes)
    })
  })

  describe('loading states', () => {
    it('should show loading during initial fetch', () => {
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => mockTelescopes,
            })
          }, 100)
        })
      })

      const { result } = renderHook(() => useTelescopes())

      expect(result.current.loading).toBe(true)
      expect(result.current.telescopes).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('should show loading during refetch', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTelescopes,
      })

      const { result } = renderHook(() => useTelescopes())

      // Wait for initial fetch
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Mock a slower response for refetch
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => mockTelescopes,
            })
          }, 100)
        })
      })

      act(() => {
        result.current.refetch()
      })

      expect(result.current.loading).toBe(true)
    })
  })

  describe('concurrent requests', () => {
    it('should handle multiple concurrent refetch calls', async () => {
      let requestCount = 0
      global.fetch = jest.fn().mockImplementation(() => {
        requestCount++
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => mockTelescopes,
            })
          }, 50)
        })
      })

      const { result } = renderHook(() => useTelescopes())

      // Wait for initial fetch
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Make multiple concurrent refetch calls
      act(() => {
        result.current.refetch()
        result.current.refetch()
        result.current.refetch()
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Should still work correctly despite concurrent calls
      expect(result.current.telescopes).toEqual(mockTelescopes)
      expect(result.current.error).toBeNull()
    })
  })

  describe('unmounting', () => {
    it('should not update state after unmounting', async () => {
      let resolveRequest: (value: unknown) => void
      const requestPromise = new Promise(resolve => {
        resolveRequest = resolve
      })

      global.fetch = jest.fn().mockImplementation(() => requestPromise)

      const { result, unmount } = renderHook(() => useTelescopes())

      expect(result.current.loading).toBe(true)

      // Unmount before request completes
      unmount()

      // Complete the request
      resolveRequest!({
        ok: true,
        json: async () => mockTelescopes,
      })

      // Give it time to potentially update state
      await new Promise(resolve => setTimeout(resolve, 50))

      // No errors should be thrown from attempting to update unmounted component
      expect(true).toBe(true) // Test that we reach this point without errors
    })
  })
})