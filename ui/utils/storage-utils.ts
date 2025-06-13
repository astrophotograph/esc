/**
 * Storage utility functions for persisting data to localStorage
 */

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: "telescope-settings",
  OBSERVATIONS: "telescope-observations",
  SESSIONS: "telescope-sessions",
  PLANNED_SESSIONS: "telescope-planned-sessions",
  LOCATIONS: "telescope-locations",
  NOTIFICATION_SETTINGS: "telescope-notification-settings",
  NOTIFICATION_HISTORY: "telescope-notification-history",
  CURRENT_LOCATION: "telescope-current-location",
  UI_STATE: "telescope-ui-state",
  VERSION: "telescope-data-version",
}

// Current data version - increment when making breaking changes to data structure
export const CURRENT_DATA_VERSION = 1

/**
 * Save data to localStorage with error handling
 */
export function saveToStorage<T>(key: string, data: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch (error) {
    console.error(`Error saving data to localStorage (${key}):`, error)
    return false
  }
}

/**
 * Load data from localStorage with error handling
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const storedData = localStorage.getItem(key)
    if (storedData === null) return defaultValue
    return JSON.parse(storedData) as T
  } catch (error) {
    console.error(`Error loading data from localStorage (${key}):`, error)
    return defaultValue
  }
}

/**
 * Check if localStorage is available
 */
export function isStorageAvailable(): boolean {
  try {
    const testKey = "__storage_test__"
    localStorage.setItem(testKey, testKey)
    localStorage.removeItem(testKey)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Clear all telescope data from localStorage
 */
export function clearAllStoredData(): boolean {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key)
    })
    return true
  } catch (error) {
    console.error("Error clearing stored data:", error)
    return false
  }
}

/**
 * Get the total size of stored data in bytes
 */
export function getStorageUsage(): number {
  try {
    let totalSize = 0
    Object.values(STORAGE_KEYS).forEach((key) => {
      const item = localStorage.getItem(key)
      if (item) {
        totalSize += item.length * 2 // Approximate size in bytes (UTF-16 encoding)
      }
    })
    return totalSize
  } catch (error) {
    console.error("Error calculating storage usage:", error)
    return 0
  }
}

/**
 * Export all stored data as a JSON file
 */
export function exportStoredData(): string {
  const exportData: Record<string, any> = {
    version: CURRENT_DATA_VERSION,
    exportDate: new Date().toISOString(),
    data: {},
  }

  Object.values(STORAGE_KEYS).forEach((key) => {
    try {
      const item = localStorage.getItem(key)
      if (item) {
        exportData.data[key] = JSON.parse(item)
      }
    } catch (error) {
      console.error(`Error exporting data for key ${key}:`, error)
    }
  })

  return JSON.stringify(exportData, null, 2)
}

/**
 * Import data from a JSON string
 */
export function importStoredData(jsonData: string): boolean {
  try {
    const importData = JSON.parse(jsonData)

    // Version check
    if (!importData.version || importData.version > CURRENT_DATA_VERSION) {
      console.error("Incompatible data version")
      return false
    }

    // Import each key
    if (importData.data) {
      Object.entries(importData.data).forEach(([key, value]) => {
        if (Object.values(STORAGE_KEYS).includes(key)) {
          saveToStorage(key, value)
        }
      })
    }

    return true
  } catch (error) {
    console.error("Error importing data:", error)
    return false
  }
}
