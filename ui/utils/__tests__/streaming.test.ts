import {
  generateStreamingUrl,
  getTelescopeScope,
  isValidStreamType,
  STREAM_TYPES,
  StreamType,
  TelescopeInfo,
} from '../streaming'

describe('streaming utils', () => {
  describe('generateStreamingUrl', () => {
    it('should generate URL with default video stream type', () => {
      const telescope: TelescopeInfo = {
        serial_number: 'TEST123',
        host: '192.168.1.100',
        name: 'Test Telescope',
      }
      
      const url = generateStreamingUrl(telescope)
      expect(url).toBe('/api/test123/stream?type=video')
    })

    it('should generate URL with custom stream type', () => {
      const telescope: TelescopeInfo = {
        serial_number: 'TEST123',
      }
      
      const url = generateStreamingUrl(telescope, 'preview')
      expect(url).toBe('/api/test123/stream?type=preview')
    })

    it('should handle null telescope', () => {
      const url = generateStreamingUrl(null)
      expect(url).toBe('/api/localhost/stream?type=video')
    })

    it('should generate URL with all stream types', () => {
      const telescope: TelescopeInfo = { name: 'Test' }
      const streamTypes: StreamType[] = ['video', 'live', 'preview', 'thumb', 'allsky', 'guide', 'finder']
      
      streamTypes.forEach(type => {
        const url = generateStreamingUrl(telescope, type)
        expect(url).toBe(`/api/test/stream?type=${type}`)
      })
    })
  })

  describe('getTelescopeScope', () => {
    it('should prioritize serial_number', () => {
      const telescope: TelescopeInfo = {
        serial_number: 'SN123',
        host: '192.168.1.100',
        name: 'Telescope Name',
        id: 'telescope-id',
      }
      
      expect(getTelescopeScope(telescope)).toBe('sn123')
    })

    it('should use host when serial_number is not available', () => {
      const telescope: TelescopeInfo = {
        host: '192.168.1.100:4700',
        name: 'Telescope Name',
        id: 'telescope-id',
      }
      
      expect(getTelescopeScope(telescope)).toBe('192.168.1.100')
    })

    it('should extract host from host:port format', () => {
      const telescope: TelescopeInfo = {
        host: '192.168.1.100:4700',
      }
      
      expect(getTelescopeScope(telescope)).toBe('192.168.1.100')
    })

    it('should handle host without port', () => {
      const telescope: TelescopeInfo = {
        host: '192.168.1.100',
      }
      
      expect(getTelescopeScope(telescope)).toBe('192.168.1.100')
    })

    it('should use name when serial_number and host are not available', () => {
      const telescope: TelescopeInfo = {
        name: 'My Telescope',
        id: 'telescope-id',
      }
      
      expect(getTelescopeScope(telescope)).toBe('my-telescope')
    })

    it('should use id as last resort', () => {
      const telescope: TelescopeInfo = {
        id: 'telescope-id-123',
      }
      
      expect(getTelescopeScope(telescope)).toBe('telescope-id-123')
    })

    it('should return localhost for null telescope', () => {
      expect(getTelescopeScope(null)).toBe('localhost')
    })

    it('should return localhost for empty telescope object', () => {
      expect(getTelescopeScope({})).toBe('localhost')
    })
  })

  describe('sanitizeScope', () => {
    // Testing via getTelescopeScope since sanitizeScope is private
    
    it('should replace spaces with hyphens', () => {
      const telescope: TelescopeInfo = {
        name: 'My Test Telescope',
      }
      
      expect(getTelescopeScope(telescope)).toBe('my-test-telescope')
    })

    it('should remove invalid characters', () => {
      const telescope: TelescopeInfo = {
        name: 'Test@Telescope#123!',
      }
      
      expect(getTelescopeScope(telescope)).toBe('testtelescope123')
    })

    it('should convert to lowercase', () => {
      const telescope: TelescopeInfo = {
        name: 'TEST-TELESCOPE',
      }
      
      expect(getTelescopeScope(telescope)).toBe('test-telescope')
    })

    it('should preserve valid characters (alphanumeric, dots, hyphens, underscores)', () => {
      const telescope: TelescopeInfo = {
        name: 'Test_Telescope-123.v2',
      }
      
      expect(getTelescopeScope(telescope)).toBe('test_telescope-123.v2')
    })

    it('should limit length to 64 characters', () => {
      const telescope: TelescopeInfo = {
        name: 'a'.repeat(100),
      }
      
      const result = getTelescopeScope(telescope)
      expect(result.length).toBe(64)
      expect(result).toBe('a'.repeat(64))
    })

    it('should return localhost if input becomes empty after sanitization', () => {
      const telescope: TelescopeInfo = {
        name: '@#$%^&*()',
      }
      
      expect(getTelescopeScope(telescope)).toBe('localhost')
    })

    it('should handle empty string', () => {
      const telescope: TelescopeInfo = {
        name: '',
      }
      
      expect(getTelescopeScope(telescope)).toBe('localhost')
    })

    it('should handle whitespace-only string', () => {
      const telescope: TelescopeInfo = {
        name: '   ',
      }
      
      // Spaces get converted to hyphens, then substring(0,64) results in '-'
      expect(getTelescopeScope(telescope)).toBe('-')
    })
  })

  describe('isValidStreamType', () => {
    it('should return true for valid stream types', () => {
      const validTypes = ['video', 'live', 'preview', 'thumb', 'allsky', 'guide', 'finder']
      
      validTypes.forEach(type => {
        expect(isValidStreamType(type)).toBe(true)
      })
    })

    it('should return false for invalid stream types', () => {
      const invalidTypes = ['invalid', 'test', 'camera', '', 'VIDEO', 'Live']
      
      invalidTypes.forEach(type => {
        expect(isValidStreamType(type)).toBe(false)
      })
    })

    it('should work as type guard', () => {
      const maybeStreamType: string = 'video'
      
      if (isValidStreamType(maybeStreamType)) {
        // TypeScript should recognize this as StreamType
        const streamType: StreamType = maybeStreamType
        expect(streamType).toBe('video')
      }
    })
  })

  describe('STREAM_TYPES', () => {
    it('should have all expected stream types', () => {
      const expectedTypes = ['video', 'live', 'preview', 'thumb', 'allsky', 'guide', 'finder']
      
      expectedTypes.forEach(type => {
        expect(STREAM_TYPES).toHaveProperty(type)
        expect(typeof STREAM_TYPES[type as keyof typeof STREAM_TYPES]).toBe('string')
      })
    })

    it('should have meaningful descriptions', () => {
      expect(STREAM_TYPES.video).toContain('Main telescope camera')
      expect(STREAM_TYPES.live).toContain('alias for video')
      expect(STREAM_TYPES.preview).toContain('Preview/thumbnail')
      expect(STREAM_TYPES.thumb).toContain('alias for preview')
      expect(STREAM_TYPES.allsky).toContain('All-sky camera')
      expect(STREAM_TYPES.guide).toContain('Guide camera')
      expect(STREAM_TYPES.finder).toContain('Finder camera')
    })
  })

  describe('XSS prevention', () => {
    it('should sanitize potential XSS in telescope name', () => {
      const telescope: TelescopeInfo = {
        name: '<script>alert("xss")</script>',
      }
      
      expect(getTelescopeScope(telescope)).toBe('scriptalertxssscript')
    })

    it('should sanitize SQL injection attempts', () => {
      const telescope: TelescopeInfo = {
        name: "test'; DROP TABLE telescopes; --",
      }
      
      expect(getTelescopeScope(telescope)).toBe('test-drop-table-telescopes---')
    })

    it('should sanitize path traversal attempts', () => {
      const telescope: TelescopeInfo = {
        name: '../../../etc/passwd',
      }
      
      // Forward slashes are removed, dots are preserved
      expect(getTelescopeScope(telescope)).toBe('......etcpasswd')
    })

    it('should handle URL encoding attempts', () => {
      const telescope: TelescopeInfo = {
        name: 'test%20telescope%3Cscript%3E',
      }
      
      expect(getTelescopeScope(telescope)).toBe('test20telescope3cscript3e')
    })
  })
})