import { useEffect } from 'react'
import { TelescopeHeader } from './components/TelescopeHeader'
import { TelescopeView } from './components/TelescopeView'
import { CatalogSearch } from './components/CatalogSearch'
import { ImageViewer } from './components/ImageViewer'
import { SessionPlanning } from './components/SessionPlanning'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
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
    activeTab,
    setActiveTab,
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

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
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

        <div className="flex-1 overflow-hidden">
          {activeTab === 'telescope' && <TelescopeView />}
          {activeTab === 'catalog' && (
            <div className="h-full overflow-auto p-4">
              <CatalogSearch />
            </div>
          )}
          {activeTab === 'imaging' && (
            <div className="h-full overflow-auto p-4">
              <ImageViewer />
            </div>
          )}
          {activeTab === 'planning' && (
            <div className="h-full overflow-auto p-4">
              <SessionPlanning />
            </div>
          )}
        </div>
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
