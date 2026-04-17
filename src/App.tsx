import { useEffect, useRef } from 'react'
import { TelescopeHeader } from './components/TelescopeHeader'
import { TelescopeView } from './components/TelescopeView'
import { CatalogSearch } from './components/CatalogSearch'
import { ImageViewer } from './components/ImageViewer'
import { SessionPlanning } from './components/SessionPlanning'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { AppFooter } from './components/AppFooter'
import { KeyboardHelp } from './components/KeyboardHelp'
import { SettingsPanel } from './components/SettingsPanel'
import { Toaster } from './components/ui/toaster'
import { initializeTauriEvents, cleanupTauriEvents } from './services/tauriEvents'
import { runtime, invoke } from './services/api'
import { useUIStore } from './stores/uiStore'
import { useTelescopeStore } from './stores/telescopeStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useFontScaling } from './hooks/useFontScaling'
import { useTelescopeStatusPoller } from './hooks/useTelescopeStatusPoller'
import { themes } from './themes'

function App() {
  const {
    theme,
    activeTab,
    setActiveTab,
    isFullscreen,
  } = useUIStore()

  const uiHydrated = useUIStore((state) => state._hasHydrated)

  const {
    telescopes,
    currentTelescopeId,
    updateTelescope,
  } = useTelescopeStore()
  const telescopeHydrated = useTelescopeStore((state) => state._hasHydrated)

  const autoConnectAttempted = useRef(false)

  // Initialize keyboard shortcuts
  useKeyboardShortcuts()

  // Handle system font scaling (DPI/accessibility settings)
  useFontScaling()

  // Centralized telescope status polling (single poller for all components)
  useTelescopeStatusPoller()

  // Initialize Tauri event listeners
  useEffect(() => {
    if (!runtime.isTauri) return

    // Hold the promise so the cleanup closure can always await and unlisten,
    // even when React StrictMode unmounts before the async init resolves.
    const listenersPromise = initializeTauriEvents()

    return () => {
      listenersPromise.then(cleanupTauriEvents)
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
      {/* Header — hidden in fullscreen */}
      {!isFullscreen && <TelescopeHeader />}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Tab bar — hidden in fullscreen */}
        {!isFullscreen && (
          <div className="px-4 py-2 border-b border-border bg-card/80">
            <Tabs value={activeTab} onValueChange={(tab) => setActiveTab(tab as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="telescope">Telescope</TabsTrigger>
                <TabsTrigger value="catalog">Catalog</TabsTrigger>
                <TabsTrigger value="imaging">Imaging</TabsTrigger>
                <TabsTrigger value="planning">Planning</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {(activeTab === 'telescope' || isFullscreen) && <TelescopeView />}
          {activeTab === 'catalog' && !isFullscreen && (
            <div className="h-full overflow-auto p-4">
              <CatalogSearch />
            </div>
          )}
          {activeTab === 'imaging' && !isFullscreen && (
            <div className="h-full overflow-auto p-4">
              <ImageViewer />
            </div>
          )}
          {activeTab === 'planning' && !isFullscreen && (
            <div className="h-full overflow-auto p-4">
              <SessionPlanning />
            </div>
          )}
        </div>
      </main>

      {/* Footer — hidden in fullscreen */}
      {!isFullscreen && <AppFooter />}

      {/* Keyboard Help Modal */}
      <KeyboardHelp />

      {/* Settings Panel */}
      <SettingsPanel />

      {/* Toast Notifications */}
      <Toaster />
    </div>
  )
}

export default App
