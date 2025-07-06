"use client"

import { useEffect } from "react"
import { NotificationPanels } from "./notification-panels"
import { LocationManagement } from "./location-management"
import { TelescopeProvider } from "./context/TelescopeContext"
import { Header } from "./components/telescope/Header"
import { CameraView } from "./components/telescope/CameraView"
import { ControlPanel } from "./components/telescope/ControlPanel"
import { PlanningPanel } from "./components/telescope/modals/PlanningPanel"
import { NotificationSettings as NotificationSettingsModal } from "./components/telescope/modals/NotificationSettings"
import { NotificationHistory as NotificationHistoryModal } from "./components/telescope/modals/NotificationHistory"
import { KeyboardHelp as KeyboardHelpModal } from "./components/telescope/modals/KeyboardHelp"
import { DataPersistenceManager } from "./components/telescope/DataPersistenceManager"
import { useTelescopeContext } from "./context/TelescopeContext"
import { PictureInPictureOverlay } from "./components/telescope/PictureInPictureOverlay"
import { PipOverlayControls } from "./components/telescope/PipOverlayControls"
import { DataManagementSettings } from "./components/telescope/modals/DataManagementSettings"
import { EquipmentManager } from "./components/telescope/modals/EquipmentManager"
import { CelestialSearchDialog } from "./components/telescope/CelestialSearchDialog"
import { TelescopeManagementModal } from "./components/telescope/modals/TelescopeManagementModal"

function TelescopeControlContent() {
  const {
    showPlanningPanel,
    showNotificationSettings,
    showNotificationHistory,
    showKeyboardHelp,
    setShowKeyboardHelp,
    showLocationManager,
    setShowLocationManager,
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
  } = useTelescopeContext()

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron')

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Draggable title bar for Electron only */}
      {isElectron && (
        <div className="h-8 bg-gray-800 flex items-center justify-center px-4 electron-drag">
          <span className="text-sm text-gray-400">ALP Experimental</span>
        </div>
      )}
      
      <div className="p-2">
        <div className="max-w-7xl mx-auto">
          <Header />

        <div className={`grid gap-6 ${isControlsCollapsed ? "grid-cols-1" : "lg:grid-cols-4"}`}>
          <div className={`${isControlsCollapsed ? "col-span-1" : "lg:col-span-3"}`}>
            <CameraView />
          </div>
          {!isControlsCollapsed && (
            <div className="lg:col-span-1">
              <ControlPanel />
            </div>
          )}
        </div>

        {/* Modals */}
        {showPlanningPanel && <PlanningPanel />}
        {showNotificationSettings && <NotificationSettingsModal />}
        {showNotificationHistory && <NotificationHistoryModal />}
        {showKeyboardHelp && <KeyboardHelpModal onClose={() => setShowKeyboardHelp(false)} />}
        {showLocationManager && <LocationManagement onClose={() => setShowLocationManager(false)} />}
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

        <DataPersistenceManager />
        </div>
        
        {/* Picture-in-Picture Overlay - moved outside max-width container */}
        <PictureInPictureOverlay />
        
        {/* PiP Overlay Controls - moved outside max-width container */}
        <PipOverlayControls />
      </div>
    </div>
  )
}

export default function TelescopeControl() {
  return (
    <TelescopeProvider>
      <TelescopeControlContent />
      <NotificationPanels notifications={[]} onDismiss={() => {}} onMarkAsRead={() => {}} />
    </TelescopeProvider>
  )
}
