import { useEffect, useCallback } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useImagingStore } from '../stores/imagingStore'
import { useTelescope } from './useTelescope'
import { useImaging } from './useImaging'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  description: string
  category: 'navigation' | 'telescope' | 'imaging' | 'ui'
  action: () => void
}

/**
 * Hook to set up global keyboard shortcuts
 */
export function useKeyboardShortcuts() {
  const {
    setShowKeyboardHelp,
    setShowCelestialSearch,
    setShowSettings,
    togglePiP,
    toggleFullscreen,
    toggleSidebar,
    setActiveTab,
    closeAllModals,
    showKeyboardHelp,
    showSettings,
    showCelestialSearch,
  } = useUIStore()

  const { currentTelescopeId } = useTelescopeStore()
  const { sessions } = useImagingStore()

  const { stopGoto, moveTelescope, stopMove, focusIncrement } = useTelescope()
  const { startImaging, stopImaging } = useImaging()

  // Check if any modal is open
  const isModalOpen = showKeyboardHelp || showSettings || showCelestialSearch

  // Define shortcuts
  const getShortcuts = useCallback((): KeyboardShortcut[] => {
    const telescopeId = currentTelescopeId
    const hasActiveImaging = telescopeId ? sessions[telescopeId]?.isActive : false

    return [
      // Navigation shortcuts
      {
        key: 'k',
        ctrl: true,
        description: 'Quick search / Go to target',
        category: 'navigation',
        action: () => setShowCelestialSearch(true),
      },
      {
        key: 'k',
        meta: true,
        description: 'Quick search / Go to target',
        category: 'navigation',
        action: () => setShowCelestialSearch(true),
      },
      {
        key: '1',
        ctrl: true,
        description: 'Switch to Telescope tab',
        category: 'navigation',
        action: () => setActiveTab('telescope'),
      },
      {
        key: '2',
        ctrl: true,
        description: 'Switch to Catalog tab',
        category: 'navigation',
        action: () => setActiveTab('catalog'),
      },
      {
        key: '3',
        ctrl: true,
        description: 'Switch to Imaging tab',
        category: 'navigation',
        action: () => setActiveTab('imaging'),
      },
      {
        key: '4',
        ctrl: true,
        description: 'Switch to Planning tab',
        category: 'navigation',
        action: () => setActiveTab('planning'),
      },

      // UI shortcuts
      {
        key: '?',
        shift: true,
        description: 'Show keyboard shortcuts help',
        category: 'ui',
        action: () => setShowKeyboardHelp(true),
      },
      {
        key: 'Escape',
        description: 'Close modal / Cancel action',
        category: 'ui',
        action: () => {
          closeAllModals()
          if (telescopeId) {
            stopGoto(telescopeId)
            stopMove(telescopeId)
          }
        },
      },
      {
        key: ',',
        ctrl: true,
        description: 'Open settings',
        category: 'ui',
        action: () => setShowSettings(true),
      },
      {
        key: ',',
        meta: true,
        description: 'Open settings',
        category: 'ui',
        action: () => setShowSettings(true),
      },
      {
        key: 'p',
        ctrl: true,
        description: 'Toggle Picture-in-Picture',
        category: 'ui',
        action: togglePiP,
      },
      {
        key: 'p',
        meta: true,
        description: 'Toggle Picture-in-Picture',
        category: 'ui',
        action: togglePiP,
      },
      {
        key: 'f',
        ctrl: true,
        description: 'Toggle fullscreen',
        category: 'ui',
        action: toggleFullscreen,
      },
      {
        key: 'b',
        ctrl: true,
        description: 'Toggle sidebar',
        category: 'ui',
        action: toggleSidebar,
      },

      // Telescope movement shortcuts (only when connected)
      ...(telescopeId
        ? [
            {
              key: 'ArrowUp',
              description: 'Move telescope North',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'north', 5),
            },
            {
              key: 'ArrowDown',
              description: 'Move telescope South',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'south', 5),
            },
            {
              key: 'ArrowLeft',
              description: 'Move telescope West',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'west', 5),
            },
            {
              key: 'ArrowRight',
              description: 'Move telescope East',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'east', 5),
            },
            {
              key: 'ArrowUp',
              shift: true,
              description: 'Move telescope North (fast)',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'north', 9),
            },
            {
              key: 'ArrowDown',
              shift: true,
              description: 'Move telescope South (fast)',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'south', 9),
            },
            {
              key: 'ArrowLeft',
              shift: true,
              description: 'Move telescope West (fast)',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'west', 9),
            },
            {
              key: 'ArrowRight',
              shift: true,
              description: 'Move telescope East (fast)',
              category: 'telescope' as const,
              action: () => moveTelescope(telescopeId, 'east', 9),
            },
          ]
        : []),

      // Focus shortcuts
      ...(telescopeId
        ? [
            {
              key: '+',
              description: 'Focus in',
              category: 'telescope' as const,
              action: () => focusIncrement(telescopeId, 10),
            },
            {
              key: '=',
              description: 'Focus in',
              category: 'telescope' as const,
              action: () => focusIncrement(telescopeId, 10),
            },
            {
              key: '-',
              description: 'Focus out',
              category: 'telescope' as const,
              action: () => focusIncrement(telescopeId, -10),
            },
            {
              key: '+',
              shift: true,
              description: 'Focus in (fine)',
              category: 'telescope' as const,
              action: () => focusIncrement(telescopeId, 1),
            },
            {
              key: '-',
              shift: true,
              description: 'Focus out (fine)',
              category: 'telescope' as const,
              action: () => focusIncrement(telescopeId, -1),
            },
          ]
        : []),

      // Imaging shortcuts
      ...(telescopeId
        ? [
            {
              key: ' ',
              description: hasActiveImaging ? 'Stop imaging' : 'Start imaging',
              category: 'imaging' as const,
              action: () => {
                if (hasActiveImaging) {
                  stopImaging(telescopeId)
                } else {
                  // Use default settings from telescope settings
                  const settings = useTelescopeStore.getState().telescopeSettings[telescopeId]
                  if (settings) {
                    startImaging(telescopeId, settings.exposure, settings.gain)
                  }
                }
              },
            },
          ]
        : []),
    ]
  }, [
    currentTelescopeId,
    sessions,
    setShowKeyboardHelp,
    setShowCelestialSearch,
    setShowSettings,
    togglePiP,
    toggleFullscreen,
    toggleSidebar,
    setActiveTab,
    closeAllModals,
    stopGoto,
    moveTelescope,
    stopMove,
    focusIncrement,
    startImaging,
    stopImaging,
  ])

  // Handle key events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape to work even in inputs
        if (event.key !== 'Escape') {
          return
        }
      }

      const shortcuts = getShortcuts()

      for (const shortcut of shortcuts) {
        const keyMatches =
          event.key === shortcut.key ||
          event.key.toLowerCase() === shortcut.key.toLowerCase()

        const ctrlMatches = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey
        const metaMatches = shortcut.meta ? event.metaKey : !event.metaKey
        const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey
        const altMatches = shortcut.alt ? event.altKey : !event.altKey

        // Check if either ctrl or meta is required (for cross-platform)
        const modifierMatches =
          (shortcut.ctrl || shortcut.meta)
            ? (event.ctrlKey || event.metaKey)
            : (!event.ctrlKey && !event.metaKey)

        if (
          keyMatches &&
          (shortcut.ctrl || shortcut.meta ? modifierMatches : (ctrlMatches && metaMatches)) &&
          shiftMatches &&
          altMatches
        ) {
          event.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    // Handle key up for movement (stop when key released)
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!currentTelescopeId) return

      const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      if (isArrowKey) {
        stopMove(currentTelescopeId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [getShortcuts, currentTelescopeId, stopMove])

  return {
    shortcuts: getShortcuts(),
    isModalOpen,
  }
}

/**
 * Format shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = []

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
  }
  if (shortcut.alt) {
    parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt')
  }
  if (shortcut.shift) {
    parts.push('⇧')
  }

  // Format special keys
  const keyMap: Record<string, string> = {
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    ' ': 'Space',
    'Escape': 'Esc',
  }

  parts.push(keyMap[shortcut.key] || shortcut.key.toUpperCase())

  return parts.join(' + ')
}
