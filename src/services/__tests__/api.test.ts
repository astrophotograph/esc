import { describe, it, expect, vi, afterEach } from 'vitest'
import { invoke, runtime } from '../api'

describe('API Service', () => {
  describe('runtime detection', () => {
    it('should detect environment correctly', () => {
      expect(typeof runtime.isTauri).toBe('boolean')
      expect(typeof runtime.isWeb).toBe('boolean')
      expect(runtime.isTauri).toBe(!runtime.isWeb)
    })
  })

  describe('invoke function', () => {
    it('should be callable', () => {
      expect(typeof invoke).toBe('function')
    })
  })

  // The test environment (jsdom) has no `__TAURI_INTERNALS__`, so `invoke`
  // takes the web (`fetch`) path. These exercise that path's contract.
  describe('invoke (web mode)', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it.skipIf(runtime.isTauri)('POSTs to /api/<command> and returns parsed JSON', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, value: 42 }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const result = await invoke<{ success: boolean; value: number }>('get_telescopes', {
        foo: 'bar',
      })

      expect(result).toEqual({ success: true, value: 42 })
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/get_telescopes',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foo: 'bar' }),
        }),
      )
    })

    it.skipIf(runtime.isTauri)('sends an empty object body when no args are given', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
      vi.stubGlobal('fetch', fetchMock)

      await invoke('ping')

      expect(fetchMock).toHaveBeenCalledWith('/api/ping', expect.objectContaining({ body: '{}' }))
    })

    it.skipIf(runtime.isTauri)(
      'throws with the status text when the response is not ok',
      async () => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Bad Request',
          json: async () => ({}),
        })
        vi.stubGlobal('fetch', fetchMock)

        await expect(invoke('boom')).rejects.toThrow('API call failed: Bad Request')
      },
    )
  })
})
