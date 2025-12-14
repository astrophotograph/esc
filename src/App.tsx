import { useEffect, useRef } from 'react'
import { TelescopeHeader } from './components/TelescopeHeader'
import { TelescopeView } from './components/TelescopeView'
import { AppFooter } from './components/AppFooter'
import { PictureInPicture } from './components/PictureInPicture'
import { KeyboardHelp } from './components/KeyboardHelp'
import { SettingsModal } from './components/SettingsModal'
import { Toaster } from './components/ui/toaster'
import { initializeTauriEvents, cleanupTauriEvents } from './services/tauriEvents'
import { runtime, invoke } from './services/api'
import { useUIStore } from './stores/uiStore'
import { useTelescopeStore } from './stores/telescopeStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { themes } from './themes'

function App() {
  const {
    showPiP,
    setShowPiP,
    pipTelescopeId,
    setPipTelescopeId,
    theme,
  } = useUIStore()

  const {
    currentTelescopeId,
    telescopes,
    updateTelescope,
    _hasHydrated: telescopeHydrated,
  } = useTelescopeStore()

  const uiHydrated = useUIStore((state) => state._hasHydrated)
  const autoConnectAttempted = useRef(false)

  // Initialize keyboard shortcuts
  useKeyboardShortcuts()

  // Initialize Tauri event listeners
  useEffect(() => {
    if (!runtime.isTauri) return

    let unlisteners: Awaited<ReturnType<typeof initializeTauriEvents>> = []

    initializeTauriEvents().then((listeners) => {
      unlisteners = listeners
    })

    return () => {
      cleanupTauriEvents(unlisteners)
    }
  }, [])

  // Apply theme CSS class
  useEffect(() => {
    const themeConfig = themes[theme]
    if (themeConfig) {
      // Remove all theme classes
      Object.values(themes).forEach((t) => {
        document.documentElement.classList.remove(t.cssClass)
      })
      // Add current theme class
      document.documentElement.classList.add(themeConfig.cssClass)

      // Apply dark/light mode
      if (theme === 'light' || theme === 'tufte') {
        document.documentElement.classList.remove('dark')
      } else {
        document.documentElement.classList.add('dark')
      }
    }
  }, [theme])

  // Sync PiP telescope ID with current telescope
  useEffect(() => {
    if (showPiP && !pipTelescopeId && currentTelescopeId) {
      setPipTelescopeId(currentTelescopeId)
    }
  }, [showPiP, pipTelescopeId, currentTelescopeId, setPipTelescopeId])

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      useUIStore.getState().setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Auto-connect to telescope if only one exists and was previously selected
  useEffect(() => {
    // Wait for stores to hydrate
    if (!telescopeHydrated || !uiHydrated) return

    // Only attempt auto-connect once
    if (autoConnectAttempted.current) return

    // Check if there's exactly one telescope that was previously selected
    if (
      telescopes.length === 1 &&
      currentTelescopeId &&
      telescopes[0].id === currentTelescopeId &&
      telescopes[0].status === 'disconnected'
    ) {
      autoConnectAttempted.current = true
      const telescope = telescopes[0]

      console.log(`Auto-connecting to telescope: ${telescope.name || telescope.host}`)
      updateTelescope(telescope.id, { status: 'connecting' })

      invoke('connect_telescope', { telescopeId: telescope.id })
        .then(() => {
          updateTelescope(telescope.id, { status: 'connected' })
          console.log(`Auto-connected to telescope: ${telescope.name || telescope.host}`)
        })
        .catch((error) => {
          console.error('Auto-connect failed:', error)
          updateTelescope(telescope.id, {
            status: 'error',
            error: String(error),
          })
        })
    } else {
      // Mark as attempted so we don't retry
      autoConnectAttempted.current = true
    }
  }, [telescopeHydrated, uiHydrated, telescopes, currentTelescopeId, updateTelescope])

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <TelescopeHeader />

      {/* Main Content - Telescope View */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <TelescopeView />
      </main>

      {/* Footer */}
      <AppFooter />

      {/* Picture in Picture */}
      <PictureInPicture
        show={showPiP}
        onClose={() => setShowPiP(false)}
        telescopeId={pipTelescopeId || currentTelescopeId || undefined}
      />

      {/* Keyboard Help Modal */}
      <KeyboardHelp />

      {/* Settings Modal */}
      <SettingsModal />

      {/* Toast Notifications */}
      <Toaster />
    </div>
  )
}

export default App
