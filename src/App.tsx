import { useEffect } from 'react'
import { Crosshair, Search, Image, Calendar } from 'lucide-react'
import { EnhancedHeader } from './components/EnhancedHeader'
import { TelescopeControl } from './components/TelescopeControl'
import { CatalogSearch } from './components/CatalogSearch'
import { ImageViewer } from './components/ImageViewer'
import { SessionPlanning } from './components/SessionPlanning'
import { PictureInPicture } from './components/PictureInPicture'
import { KeyboardHelp } from './components/KeyboardHelp'
import { SettingsModal } from './components/SettingsModal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
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
    <div className="min-h-screen bg-background text-foreground">
      <EnhancedHeader />

      <main className="max-w-7xl mx-auto px-4 py-4">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="telescope" className="gap-2">
              <Crosshair className="h-4 w-4" />
              <span className="hidden sm:inline">Telescope</span>
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Catalog</span>
            </TabsTrigger>
            <TabsTrigger value="imaging" className="gap-2">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">Imaging</span>
            </TabsTrigger>
            <TabsTrigger value="planning" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Planning</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="telescope" className="mt-4">
            <TelescopeControl />
          </TabsContent>

          <TabsContent value="catalog" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CatalogSearch />
              <div className="space-y-4">
                <SessionPlanning compact />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="imaging" className="mt-4">
            <ImageViewer />
          </TabsContent>

          <TabsContent value="planning" className="mt-4">
            <SessionPlanning />
          </TabsContent>
        </Tabs>
      </main>

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
