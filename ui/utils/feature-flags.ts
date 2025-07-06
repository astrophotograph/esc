/**
 * Feature flag system for controlling application features.
 * 
 * This module provides a centralized way to manage feature flags,
 * allowing for gradual rollout and A/B testing of new features.
 */

export interface FeatureFlags {
  // WebSocket migration features
  useWebSocketForStatusUpdates: boolean
  useWebSocketForControlCommands: boolean
  enableWebSocketReconnection: boolean
  
  // UI enhancements
  enableAdvancedTelescopeControls: boolean
  enableRealTimeCollaboration: boolean
  
  // Performance optimizations
  enableStatusUpdateBatching: boolean
  enableOptimisticUIUpdates: boolean
  
  // Debug features
  enableWebSocketDebugLogs: boolean
  enablePerformanceMetrics: boolean
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  // WebSocket features - disabled by default for gradual rollout
  useWebSocketForStatusUpdates: false,
  useWebSocketForControlCommands: false,
  enableWebSocketReconnection: true,
  
  // UI enhancements
  enableAdvancedTelescopeControls: false,
  enableRealTimeCollaboration: false,
  
  // Performance optimizations
  enableStatusUpdateBatching: true,
  enableOptimisticUIUpdates: true,
  
  // Debug features - enabled in development
  enableWebSocketDebugLogs: process.env.NODE_ENV === 'development',
  enablePerformanceMetrics: process.env.NODE_ENV === 'development'
}

/**
 * Feature flag manager
 */
class FeatureFlagManager {
  private flags: FeatureFlags
  private listeners: Set<(flags: FeatureFlags) => void> = new Set()
  private storageKey = 'telescope-feature-flags'

  constructor() {
    this.flags = this.loadFlags()
  }

  /**
   * Get current feature flags
   */
  getFlags(): FeatureFlags {
    return { ...this.flags }
  }

  /**
   * Check if a specific feature is enabled
   */
  isEnabled(feature: keyof FeatureFlags): boolean {
    return this.flags[feature]
  }

  /**
   * Enable a feature flag
   */
  enable(feature: keyof FeatureFlags): void {
    this.updateFlag(feature, true)
  }

  /**
   * Disable a feature flag
   */
  disable(feature: keyof FeatureFlags): void {
    this.updateFlag(feature, false)
  }

  /**
   * Toggle a feature flag
   */
  toggle(feature: keyof FeatureFlags): void {
    this.updateFlag(feature, !this.flags[feature])
  }

  /**
   * Update a specific feature flag
   */
  updateFlag(feature: keyof FeatureFlags, enabled: boolean): void {
    if (this.flags[feature] !== enabled) {
      this.flags[feature] = enabled
      this.saveFlags()
      this.notifyListeners()
    }
  }

  /**
   * Update multiple feature flags
   */
  updateFlags(updates: Partial<FeatureFlags>): void {
    let hasChanges = false
    
    for (const [feature, enabled] of Object.entries(updates)) {
      if (this.flags[feature as keyof FeatureFlags] !== enabled) {
        (this.flags as any)[feature] = enabled
        hasChanges = true
      }
    }

    if (hasChanges) {
      this.saveFlags()
      this.notifyListeners()
    }
  }

  /**
   * Reset all flags to defaults
   */
  resetToDefaults(): void {
    this.flags = { ...DEFAULT_FEATURE_FLAGS }
    this.saveFlags()
    this.notifyListeners()
  }

  /**
   * Subscribe to feature flag changes
   */
  subscribe(listener: (flags: FeatureFlags) => void): () => void {
    this.listeners.add(listener)
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Load flags from localStorage
   */
  private loadFlags(): FeatureFlags {
    try {
      if (typeof window === 'undefined') {
        return { ...DEFAULT_FEATURE_FLAGS }
      }

      const stored = localStorage.getItem(this.storageKey)
      if (!stored) {
        return { ...DEFAULT_FEATURE_FLAGS }
      }

      const parsed = JSON.parse(stored)
      
      // Merge with defaults to handle new flags
      return {
        ...DEFAULT_FEATURE_FLAGS,
        ...parsed
      }
    } catch (error) {
      console.warn('Failed to load feature flags from localStorage:', error)
      return { ...DEFAULT_FEATURE_FLAGS }
    }
  }

  /**
   * Save flags to localStorage
   */
  private saveFlags(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.flags))
      }
    } catch (error) {
      console.warn('Failed to save feature flags to localStorage:', error)
    }
  }

  /**
   * Notify all listeners of flag changes
   */
  private notifyListeners(): void {
    const flags = this.getFlags()
    this.listeners.forEach(listener => {
      try {
        listener(flags)
      } catch (error) {
        console.error('Error in feature flag listener:', error)
      }
    })
  }
}

// Global feature flag manager instance
export const featureFlags = new FeatureFlagManager()

/**
 * React hook for using feature flags
 */
export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = React.useState(featureFlags.getFlags())

  React.useEffect(() => {
    return featureFlags.subscribe(setFlags)
  }, [])

  return flags
}

/**
 * React hook for checking a specific feature flag
 */
export function useFeatureFlag(feature: keyof FeatureFlags): boolean {
  const [enabled, setEnabled] = React.useState(featureFlags.isEnabled(feature))

  React.useEffect(() => {
    return featureFlags.subscribe((flags) => {
      setEnabled(flags[feature])
    })
  }, [feature])

  return enabled
}

/**
 * Higher-order component for feature flag gating
 */
export function withFeatureFlag<P extends object>(
  feature: keyof FeatureFlags,
  Component: React.ComponentType<P>,
  FallbackComponent?: React.ComponentType<P>
) {
  return function FeatureGatedComponent(props: P) {
    const isEnabled = useFeatureFlag(feature)
    
    if (isEnabled) {
      return React.createElement(Component, props)
    }
    
    if (FallbackComponent) {
      return React.createElement(FallbackComponent, props)
    }
    
    return null
  }
}

/**
 * Feature flag debugging utilities
 */
export const FeatureFlagDebug = {
  /**
   * Log current feature flags to console
   */
  logFlags(): void {
    console.group('Feature Flags')
    const flags = featureFlags.getFlags()
    Object.entries(flags).forEach(([feature, enabled]) => {
      console.log(`${feature}: ${enabled ? '✅' : '❌'}`)
    })
    console.groupEnd()
  },

  /**
   * Enable WebSocket features for testing
   */
  enableWebSocketFeatures(): void {
    featureFlags.updateFlags({
      useWebSocketForStatusUpdates: true,
      useWebSocketForControlCommands: true,
      enableWebSocketReconnection: true,
      enableWebSocketDebugLogs: true
    })
    console.log('✅ WebSocket features enabled')
  },

  /**
   * Disable WebSocket features
   */
  disableWebSocketFeatures(): void {
    featureFlags.updateFlags({
      useWebSocketForStatusUpdates: false,
      useWebSocketForControlCommands: false,
      enableWebSocketDebugLogs: false
    })
    console.log('❌ WebSocket features disabled')
  },

  /**
   * Enable all features
   */
  enableAllFeatures(): void {
    const allEnabled = Object.keys(DEFAULT_FEATURE_FLAGS).reduce((acc, key) => {
      acc[key as keyof FeatureFlags] = true
      return acc
    }, {} as FeatureFlags)
    
    featureFlags.updateFlags(allEnabled)
    console.log('✅ All features enabled')
  }
}

// Add debug utilities to global scope in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).FeatureFlagDebug = FeatureFlagDebug
  (window as any).featureFlags = featureFlags
}

// Import React for hooks (will be available in React components)
import * as React from 'react'

export default featureFlags