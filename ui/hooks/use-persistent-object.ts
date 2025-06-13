"use client"

import { useState, useEffect, useCallback } from "react"
import { saveToStorage, loadFromStorage, isStorageAvailable } from "../utils/storage-utils"

/**
 * Custom hook for an object that persists to localStorage
 * Allows updating individual properties efficiently
 *
 * @param key The localStorage key to use
 * @param defaultValue The default object if nothing is in storage
 * @returns The object, a function to update it, and a function to update a single property
 */
export function usePersistentObject<T extends Record<string, any>>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prevValue: T) => T)) => void, <K extends keyof T>(prop: K, value: T[K]) => void] {
  // Check if localStorage is available
  const storageAvailable = isStorageAvailable()

  // Initialize state with value from localStorage or default
  const [state, setStateInternal] = useState<T>(() => {
    if (!storageAvailable) return defaultValue
    return loadFromStorage<T>(key, defaultValue)
  })

  // Update localStorage when state changes
  useEffect(() => {
    if (storageAvailable) {
      saveToStorage(key, state)
    }
  }, [key, state, storageAvailable])

  // Function to update a single property
  const updateProperty = useCallback(<K extends keyof T>(prop: K, value: T[K]) => {
    setStateInternal((prevState) => ({
      ...prevState,
      [prop]: value,
    }))
  }, [])

  return [state, setStateInternal, updateProperty]
}
