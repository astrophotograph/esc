import { describe, it, expect } from 'vitest'
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
})
