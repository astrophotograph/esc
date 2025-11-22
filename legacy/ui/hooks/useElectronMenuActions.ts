import { useEffect } from 'react';
import { useTelescopeContext } from '@/context/TelescopeContext';
import { toast } from 'sonner';

// Type for the Electron API
interface ElectronAPI {
  platform: string;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  onMenuAction: (callback: (action: string) => void) => void;
  removeMenuActionListener: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function useElectronMenuActions() {
  const {
    currentTelescope,
    selectTelescope,
    showStreamStatus,
    setShowStreamStatus,
    showAnnotations,
    setShowAnnotations,
    wsConnectionState,
    wsIsConnected,
    handleTelescopePark,
    setShowCelestialSearch,
  } = useTelescopeContext();

  useEffect(() => {
    // Only set up listeners if running in Electron
    if (!window.electronAPI) {
      return;
    }

    const handleMenuAction = async (action: string) => {
      console.log('Received menu action:', action);

      switch (action) {
        case 'connect-telescope':
          if (currentTelescope && !wsIsConnected) {
            // WebSocket connection is managed automatically when telescope is selected
            toast.info('Connecting to telescope...');
          } else if (!currentTelescope) {
            toast.error('Please select a telescope first');
          }
          break;

        case 'disconnect-telescope':
          if (wsIsConnected) {
            // To disconnect, we deselect the telescope
            selectTelescope(null, false);
            toast.info('Disconnected from telescope');
          }
          break;

        case 'park-telescope':
          if (wsIsConnected && currentTelescope) {
            await handleTelescopePark();
            // handleTelescopePark already shows status alerts
          } else if (!currentTelescope) {
            toast.error('No telescope selected');
          } else {
            toast.error('Telescope not connected');
          }
          break;

        case 'start-capture':
          // Note: Start/stop capture functionality would need to be implemented
          // in the TelescopeContext with proper WebSocket commands
          toast.info('Start capture feature coming soon');
          break;

        case 'stop-capture':
          // Note: Start/stop capture functionality would need to be implemented
          // in the TelescopeContext with proper WebSocket commands
          toast.info('Stop capture feature coming soon');
          break;

        case 'toggle-overlay':
          setShowStreamStatus(!showStreamStatus);
          break;

        case 'toggle-annotations':
          setShowAnnotations(!showAnnotations);
          break;

        case 'goto-object':
          // Open the celestial search dialog
          setShowCelestialSearch(true);
          break;

        case 'new-session':
        case 'open-session':
        case 'export-data':
        case 'preferences':
          // These would need additional implementation
          console.log(`Menu action not yet implemented: ${action}`);
          toast.info(`Feature coming soon: ${action.replace('-', ' ')}`);
          break;

        default:
          console.log('Unknown menu action:', action);
      }
    };

    // Set up the listener
    window.electronAPI.onMenuAction(handleMenuAction);

    // Cleanup listener on unmount
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeMenuActionListener();
      }
    };
  }, [
    currentTelescope,
    selectTelescope,
    showStreamStatus,
    setShowStreamStatus,
    showAnnotations,
    setShowAnnotations,
    wsConnectionState,
    wsIsConnected,
    handleTelescopePark,
    setShowCelestialSearch,
  ]);
}