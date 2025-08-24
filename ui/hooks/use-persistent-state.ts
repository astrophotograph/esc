"use client"

import { useState, useEffect, useRef } from "react"
import { saveToStorage, loadFromStorage, isStorageAvailable } from "../utils/storage-utils"

/**
 * Custom hook for state that persists to localStorage
 *
 * @param key The localStorage key to use
 * @param defaultValue The default value if nothing is in storage
 * @returns A stateful value and a function to update it, like useState
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, (value: T | ((prevValue: T) => T)) => void] {
  const isInitialized = useRef(false)
  
  // Initialize state - try to load from localStorage immediately on client side
  const [state, setState] = useState<T>(() => {
    // During SSR, always return default value
    if (typeof window === 'undefined') {
      return defaultValue
    }
    
    // On client side, try to load from localStorage immediately
    try {
      const item = localStorage.getItem(key)
      if (item !== null) {
        return JSON.parse(item) as T
      }
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error)
    }
    
    return defaultValue
  })

  // Save to localStorage when state changes
  useEffect(() => {
    // Mark as initialized after first render
    isInitialized.current = true
    
    const storageAvailable = isStorageAvailable()
    if (storageAvailable) {
      saveToStorage(key, state)
    }
  }, [key, state])

  return [state, setState]
}
