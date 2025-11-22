import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useImagingStore } from '../stores/imagingStore'

export interface TauriEventPayload {
  [key: string]: any
}

/**
 * Event names emitted by the Rust backend
 */
export const EventNames = {
  TELESCOPE_DISCOVERED: 'telescope-discovered',
  TELESCOPE_CONNECTED: 'telescope-connected',
  TELESCOPE_DISCONNECTED: 'telescope-disconnected',
  TELESCOPE_STATUS: 'telescope-status',
  TELESCOPE_ERROR: 'telescope-error',

  IMAGING_STARTED: 'imaging-started',
  IMAGING_STOPPED: 'imaging-stopped',
  IMAGING_PROGRESS: 'imaging-progress',
  IMAGING_FRAME: 'imaging-frame',

  COMMAND_RESPONSE: 'command-response',
  ERROR: 'error',
} as const

/**
 * Initialize Tauri event listeners
 * Sets up listeners for all telescope and imaging events
 */
export async function initializeTauriEvents(): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = []

  // Telescope discovery events
  unlisteners.push(
    await listen(EventNames.TELESCOPE_DISCOVERED, (event) => {
      const payload = event.payload as TauriEventPayload
      console.log('Telescope discovered:', payload)
      useTelescopeStore.getState().addTelescope(payload as any)
    })
  )

  // Telescope connection events
  unlisteners.push(
    await listen(EventNames.TELESCOPE_CONNECTED, (event) => {
      const payload = event.payload as TauriEventPayload
      console.log('Telescope connected:', payload)
      if (payload.id) {
        useTelescopeStore.getState().updateTelescope(payload.id, { status: 'connected' })
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.TELESCOPE_DISCONNECTED, (event) => {
      const payload = event.payload as TauriEventPayload
      console.log('Telescope disconnected:', payload)
      if (payload.id) {
        useTelescopeStore.getState().updateTelescope(payload.id, { status: 'disconnected' })
      }
    })
  )

  // Telescope status updates
  unlisteners.push(
    await listen(EventNames.TELESCOPE_STATUS, (event) => {
      const payload = event.payload as TauriEventPayload
      if (payload.id) {
        useTelescopeStore.getState().updateTelescopeStatus(payload.id, payload.status)
      }
    })
  )

  // Imaging events
  unlisteners.push(
    await listen(EventNames.IMAGING_STARTED, (event) => {
      const payload = event.payload as TauriEventPayload
      console.log('Imaging started:', payload)
      if (payload.telescopeId) {
        useImagingStore.getState().startSession(payload.telescopeId, {
          exposure: payload.exposure || 10000,
          gain: payload.gain || 80,
          frameCount: 0,
          targetName: payload.targetName,
          isActive: true,
          startedAt: new Date()
        })
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.IMAGING_STOPPED, (event) => {
      const payload = event.payload as TauriEventPayload
      console.log('Imaging stopped:', payload)
      if (payload.telescopeId) {
        useImagingStore.getState().stopSession(payload.telescopeId)
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.IMAGING_PROGRESS, (event) => {
      const payload = event.payload as TauriEventPayload
      if (payload.telescopeId) {
        useImagingStore.getState().updateSession(payload.telescopeId, {
          frameCount: payload.frameCount
        })
      }
    })
  )

  // Error events
  unlisteners.push(
    await listen(EventNames.ERROR, (event) => {
      const payload = event.payload as TauriEventPayload
      console.error('Tauri error event:', payload)
      // You could integrate with a toast notification system here
    })
  )

  return unlisteners
}

/**
 * Cleanup function to remove all event listeners
 */
export function cleanupTauriEvents(unlisteners: UnlistenFn[]): void {
  unlisteners.forEach(unlisten => unlisten())
}
