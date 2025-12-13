import { useEffect } from 'react'
import { TelescopeHeader } from './components/TelescopeHeader'
import { TelescopeView } from './components/TelescopeView'
import { AppFooter } from './components/AppFooter'
import { PictureInPicture } from './components/PictureInPicture'
import { KeyboardHelp } from './components/KeyboardHelp'
import { SettingsModal } from './components/SettingsModal'
import { Toaster } from './components/ui/toaster'
import { initializeTauriEvents, cleanupTauriEvents } from './services/tauriEvents'
import { runtime } from './services/api'
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

  const { currentTelescopeId } = useTelescopeStore()

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
