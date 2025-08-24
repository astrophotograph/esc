"use client"

import { useEffect } from "react"
import { NotificationPanels } from "./notification-panels"
import { LocationManagement } from "./location-management"
import { TelescopeProvider } from "./context/TelescopeContext"
import { VersionCheckProvider } from "./context/VersionCheckContext"
import { Header } from "./components/telescope/Header"
import { CameraView } from "./components/telescope/CameraView"
import { ControlPanel } from "./components/telescope/ControlPanel"
import { PlanningPanel } from "./components/telescope/modals/PlanningPanel"
import { NotificationSettings as NotificationSettingsModal } from "./components/telescope/modals/NotificationSettings"
import { NotificationHistory as NotificationHistoryModal } from "./components/telescope/modals/NotificationHistory"
import { KeyboardHelp as KeyboardHelpModal } from "./components/telescope/modals/KeyboardHelp"
import { DocumentationViewer } from "./components/telescope/modals/DocumentationViewer"
import { ConfigurationPage } from "./components/telescope/modals/ConfigurationPage"
import { DataPersistenceManager } from "./components/telescope/DataPersistenceManager"
import { useTelescopeContext } from "./context/TelescopeContext"
import { PictureInPictureOverlay } from "./components/telescope/PictureInPictureOverlay"
import { PipOverlayControls } from "./components/telescope/PipOverlayControls"
import { NetworkStatusOverlay } from "./components/telescope/NetworkStatusOverlay"
import { DataManagementSettings } from "./components/telescope/modals/DataManagementSettings"
import { EquipmentManager } from "./components/telescope/modals/EquipmentManager"
import { CelestialSearchDialog } from "./components/telescope/CelestialSearchDialog"
import { TelescopeManagementModal } from "./components/telescope/modals/TelescopeManagementModal"
import { Button } from "./components/ui/button"
import { Calendar as CalendarIcon, Settings, Search } from "lucide-react"
import { AppTour } from "./components/telescope/AppTour"
import { VersionFooter } from "./components/telescope/VersionFooter"
import { VersionUpdateNotification } from "./components/telescope/VersionUpdateNotification"
import { useIsMobile } from "./hooks/use-mobile"
import { catalogAPI } from "./services/catalog-api"
import { DEFAULT_OBSERVER_LOCATION } from "./utils/celestial-calculations"
import { ServerInitStatus } from "./components/ServerInitStatus"
import { useElectronMenuActions } from "./hooks/useElectronMenuActions"

function TelescopeControlContent() {
  const {
    showPlanningPanel,
    setShowPlanningPanel,
    showNotificationSettings,
    showNotificationHistory,
    showKeyboardHelp,
    setShowKeyboardHelp,
    showDocumentation,
    setShowDocumentation,
    showConfiguration,
    setShowConfiguration,
    showLocationManager,
    setShowLocationManager,
    observingLocations,
    setObservingLocations,
    currentObservingLocation,
    setCurrentObservingLocation,
    isControlsCollapsed,
    handleKeyDown,
    showDataManagementSettings,
    setShowDataManagementSettings,
    showCelestialSearch,
    setShowCelestialSearch,
    showEquipmentManager,
    setShowEquipmentManager,
    showTelescopeManagement,
    setShowTelescopeManagement,
    wsIsConnected,
  } = useTelescopeContext()

  const isMobile = useIsMobile()

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron')

  // Set up Electron menu actions if running in Electron
  useElectronMenuActions()

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  // Preload catalog data when the app loads (preferably after WebSocket is connected)
  useEffect(() => {
    const location = currentObservingLocation || {
      coordinates: { latitude: DEFAULT_OBSERVER_LOCATION.latitude, longitude: DEFAULT_OBSERVER_LOCATION.longitude },
      elevation: 0
    }
    
    if (wsIsConnected) {
      // WebSocket is connected, preload immediately via WebSocket
      console.log('WebSocket connected, preloading catalog data via WebSocket')
      catalogAPI.preloadQuickSearch(
        location.coordinates.latitude,
        location.coordinates.longitude,
        location.elevation
      )
    } else {
      // WebSocket not connected yet, wait a bit then preload anyway (will use HTTP)
      const timer = setTimeout(() => {
        console.log('WebSocket not connected after 3s, preloading catalog data via HTTP fallback')
        catalogAPI.preloadQuickSearch(
          location.coordinates.latitude,
          location.coordinates.longitude,
          location.elevation
        )
      }, 3000) // Wait 3 seconds for WebSocket to potentially connect
      
      return () => clearTimeout(timer)
    }
  }, [currentObservingLocation, wsIsConnected])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Draggable title bar for Electron only */}
      {isElectron && (
        <div className="h-8 bg-muted flex items-center justify-center px-4 electron-drag">
          <span className="text-sm text-muted-foreground">Experimental Scope Creep</span>
        </div>
      )}

      <div className={`${isMobile ? 'p-1 pb-16' : 'p-2 pb-12'}`}>
        <div className="max-w-7xl mx-auto">
          <Header />

          {/* Quick Actions Bar */}
          {/*<div className="my-4 flex gap-2" data-tour="quick-actions">*/}
          {/*  <Button*/}
          {/*    variant="outline"*/}
          {/*    size="sm"*/}
          {/*    onClick={() => setShowPlanningPanel(true)}*/}
          {/*    className="flex items-center gap-2"*/}
          {/*  >*/}
          {/*    <CalendarIcon className="w-4 h-4" />*/}
          {/*    Planning*/}
          {/*  </Button>*/}
          {/*  <Button*/}
          {/*    variant="outline"*/}
          {/*    size="sm"*/}
          {/*    onClick={() => setShowEquipmentManager(true)}*/}
          {/*    className="flex items-center gap-2"*/}
          {/*  >*/}
          {/*    <Settings className="w-4 h-4" />*/}
          {/*    Equipment*/}
          {/*  </Button>*/}
          {/*  <Button*/}
          {/*    variant="outline"*/}
          {/*    size="sm"*/}
          {/*    onClick={() => setShowCelestialSearch(true)}*/}
          {/*    className="flex items-center gap-2"*/}
          {/*  >*/}
          {/*    <Search className="w-4 h-4" />*/}
          {/*    Celestial Search*/}
          {/*  </Button>*/}
          {/*</div>*/}

        <div className={`grid gap-2 md:gap-6 ${
          isControlsCollapsed || isMobile 
            ? "grid-cols-1" 
            : "grid-cols-1 lg:grid-cols-4"
        }`}>
          <div className={`${
            isControlsCollapsed || isMobile 
              ? "col-span-1" 
              : "col-span-1 lg:col-span-3"
          }`}>
            <CameraView />
          </div>
          {!isControlsCollapsed && !isMobile && (
            <div className="lg:col-span-1">
              <ControlPanel />
            </div>
          )}
        </div>

        {/* Mobile Controls Panel - Show as overlay when on mobile */}
        {isMobile && !isControlsCollapsed && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border max-h-80 overflow-y-auto">
            <ControlPanel />
          </div>
        )}

        {/* Modals */}
        {showPlanningPanel && <PlanningPanel />}
        {showNotificationSettings && <NotificationSettingsModal />}
        {showNotificationHistory && <NotificationHistoryModal />}
        {showKeyboardHelp && <KeyboardHelpModal onClose={() => setShowKeyboardHelp(false)} />}
        {showLocationManager && (
          <LocationManagement 
            showLocationManager={showLocationManager}
            setShowLocationManager={setShowLocationManager}
            locations={observingLocations}
            setLocations={setObservingLocations}
            currentLocation={currentObservingLocation}
            setCurrentLocation={setCurrentObservingLocation}
          />
        )}
        {showDataManagementSettings && <DataManagementSettings onClose={() => setShowDataManagementSettings(false)} />}
        {showEquipmentManager && <EquipmentManager onClose={() => setShowEquipmentManager(false)} />}

        {/* Celestial Search Dialog */}
        <CelestialSearchDialog
          open={showCelestialSearch}
          onOpenChange={setShowCelestialSearch}
        />

        {/* Telescope Management Modal */}
        <TelescopeManagementModal
          open={showTelescopeManagement}
          onOpenChange={setShowTelescopeManagement}
        />

        {/* Documentation Viewer */}
        <DocumentationViewer
          open={showDocumentation}
          onOpenChange={setShowDocumentation}
        />

        {/* Configuration Page */}
        <ConfigurationPage
          open={showConfiguration}
          onOpenChange={setShowConfiguration}
        />

        <DataPersistenceManager />
        </div>

        {/* Picture-in-Picture Overlay - moved outside max-width container */}
        <PictureInPictureOverlay />

        {/* PiP Overlay Controls - moved outside max-width container */}
        <PipOverlayControls />

        {/* Network Status Overlay - moved outside max-width container for proper dragging */}
        <NetworkStatusOverlay />

        {/* App Tour */}
        <AppTour />
        
        {/* Version Update Notification */}
        <VersionUpdateNotification />
      </div>
      
      {/* Version Footer - hidden in full screen mode */}
      <VersionFooter />
    </div>
  )
}

export default function TelescopeControl() {
  // Only show ServerInitStatus in development or when explicitly enabled
  const showServerInit = process.env.NODE_ENV === 'development' || 
                         typeof window !== 'undefined' && 
                         window.location.search.includes('show_init')
  
  return (
    <VersionCheckProvider checkIntervalMinutes={1440}>
      <TelescopeProvider>
        {showServerInit && <ServerInitStatus />}
        <TelescopeControlContent />
        <NotificationPanels notifications={[]} onDismiss={() => {}} onMarkAsRead={() => {}} />
      </TelescopeProvider>
    </VersionCheckProvider>
  )
}
