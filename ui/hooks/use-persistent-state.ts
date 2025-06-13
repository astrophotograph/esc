"use client"

import { useState, useEffect } from "react"
import { saveToStorage, loadFromStorage, isStorageAvailable } from "../utils/storage-utils"

/**
 * Custom hook for state that persists to localStorage
 *
 * @param key The localStorage key to use
 * @param defaultValue The default value if nothing is in storage
 * @returns A stateful value and a function to update it, like useState
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, (value: T | ((prevValue: T) => T)) => void] {
  // Check if localStorage is available
  const storageAvailable = isStorageAvailable()

  // Initialize state with value from localStorage or default
  const [state, setState] = useState<T>(() => {
    if (!storageAvailable) return defaultValue
    return loadFromStorage<T>(key, defaultValue)
  })

  // Update localStorage when state changes
  useEffect(() => {
    if (storageAvailable) {
      saveToStorage(key, state)
    }
  }, [key, state, storageAvailable])

  return [state, setState]
}
