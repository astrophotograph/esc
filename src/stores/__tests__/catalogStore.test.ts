import { describe, it, expect, beforeEach } from 'vitest'
import { useCatalogStore } from '../catalogStore'

describe('catalogStore', () => {
  beforeEach(() => {
    // Reset store state
    useCatalogStore.setState({
      searchResults: [],
      solarSystemObjects: [],
      objectTypes: [],
      selectedObject: null,
      isSearching: false,
      filters: {
        query: '',
        objectType: undefined,
        minMagnitude: undefined,
        maxMagnitude: 10,
        aboveHorizonOnly: true,
        limit: 50,
      },
      recentSearches: [],
    })
  })

  describe('search results', () => {
    it('should set search results', () => {
      const results = [
        {
          id: 'M31',
          name: 'Andromeda Galaxy',
          object_type: 'galaxy',
          ra_decimal: 10.68,
          dec_decimal: 41.27,
          magnitude: 3.44,
          constellation: 'Andromeda',
          above_horizon: true,
        },
      ]

      useCatalogStore.getState().setSearchResults(results)

      const state = useCatalogStore.getState()
      expect(state.searchResults).toHaveLength(1)
      expect(state.searchResults[0].name).toBe('Andromeda Galaxy')
    })

    it('should clear search results by setting empty array', () => {
      useCatalogStore.getState().setSearchResults([
        {
          id: 'M31',
          name: 'Andromeda Galaxy',
          object_type: 'galaxy',
          ra_decimal: 10.68,
          dec_decimal: 41.27,
          constellation: 'Andromeda',
          above_horizon: true,
        },
      ])
      useCatalogStore.getState().setSearchResults([])

      const state = useCatalogStore.getState()
      expect(state.searchResults).toHaveLength(0)
    })
  })

  describe('selected object', () => {
    it('should set selected object', () => {
      const object = {
        id: 'M31',
        name: 'Andromeda Galaxy',
        object_type: 'galaxy',
        ra_decimal: 10.68,
        dec_decimal: 41.27,
        constellation: 'Andromeda',
        above_horizon: true,
      }

      useCatalogStore.getState().setSelectedObject(object)

      const state = useCatalogStore.getState()
      expect(state.selectedObject).toEqual(object)
    })

    it('should clear selected object', () => {
      useCatalogStore.getState().setSelectedObject({
        id: 'M31',
        name: 'Andromeda Galaxy',
        object_type: 'galaxy',
        ra_decimal: 10.68,
        dec_decimal: 41.27,
        constellation: 'Andromeda',
        above_horizon: true,
      })
      useCatalogStore.getState().setSelectedObject(null)

      const state = useCatalogStore.getState()
      expect(state.selectedObject).toBeNull()
    })
  })

  describe('recent searches', () => {
    it('should add to recent searches', () => {
      useCatalogStore.getState().addRecentSearch('M31')
      useCatalogStore.getState().addRecentSearch('NGC 7000')

      const state = useCatalogStore.getState()
      expect(state.recentSearches).toHaveLength(2)
      expect(state.recentSearches[0]).toBe('NGC 7000') // Most recent first
      expect(state.recentSearches[1]).toBe('M31')
    })

    it('should not duplicate recent searches', () => {
      useCatalogStore.getState().addRecentSearch('M31')
      useCatalogStore.getState().addRecentSearch('M31')

      const state = useCatalogStore.getState()
      expect(state.recentSearches).toHaveLength(1)
    })

    it('should limit recent searches to 10', () => {
      for (let i = 0; i < 15; i++) {
        useCatalogStore.getState().addRecentSearch(`Search ${i}`)
      }

      const state = useCatalogStore.getState()
      expect(state.recentSearches).toHaveLength(10)
    })

    it('should clear recent searches', () => {
      useCatalogStore.getState().addRecentSearch('M31')
      useCatalogStore.getState().clearRecentSearches()

      const state = useCatalogStore.getState()
      expect(state.recentSearches).toHaveLength(0)
    })
  })

  describe('filters', () => {
    it('should update filters', () => {
      useCatalogStore.getState().updateFilters({
        objectType: 'galaxy',
        minMagnitude: 0,
        maxMagnitude: 10,
      })

      const state = useCatalogStore.getState()
      expect(state.filters.objectType).toBe('galaxy')
      expect(state.filters.minMagnitude).toBe(0)
      expect(state.filters.maxMagnitude).toBe(10)
    })

    it('should reset filters', () => {
      useCatalogStore.getState().updateFilters({
        objectType: 'galaxy',
        minMagnitude: 5,
      })
      useCatalogStore.getState().resetFilters()

      const state = useCatalogStore.getState()
      expect(state.filters.objectType).toBeUndefined()
      expect(state.filters.minMagnitude).toBeUndefined()
    })
  })

  describe('searching state', () => {
    it('should set searching state', () => {
      useCatalogStore.getState().setIsSearching(true)
      expect(useCatalogStore.getState().isSearching).toBe(true)

      useCatalogStore.getState().setIsSearching(false)
      expect(useCatalogStore.getState().isSearching).toBe(false)
    })
  })

  describe('solar system objects', () => {
    it('should set solar system objects', () => {
      const objects = [
        {
          id: 'moon',
          name: 'Moon',
          object_type: 'moon' as const,
          ra_decimal: 15.5,
          dec_decimal: -10.2,
          above_horizon: true,
          phase: 0.75,
        },
      ]

      useCatalogStore.getState().setSolarSystemObjects(objects)

      const state = useCatalogStore.getState()
      expect(state.solarSystemObjects).toHaveLength(1)
      expect(state.solarSystemObjects[0].name).toBe('Moon')
    })
  })

  describe('object types', () => {
    it('should set object types', () => {
      const types = [
        { id: 'galaxy', name: 'Galaxy', count: 100 },
        { id: 'nebula', name: 'Nebula', count: 50 },
      ]

      useCatalogStore.getState().setObjectTypes(types)

      const state = useCatalogStore.getState()
      expect(state.objectTypes).toHaveLength(2)
    })
  })
})
