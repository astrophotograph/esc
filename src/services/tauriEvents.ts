import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useImagingStore } from '../stores/imagingStore'
import { useUIStore } from '../stores/uiStore'
import { toast } from '../hooks/useToast'

export interface TauriEventPayload {
  [key: string]: unknown
}

/**
 * Event names emitted by the Rust backend
 * Uses colon-separated format matching src-tauri/src/events.rs
 */
export const EventNames = {
  // Telescope events
  TELESCOPE_DISCOVERED: 'telescope:discovered',
  TELESCOPE_CONNECTED: 'telescope:connected',
  TELESCOPE_DISCONNECTED: 'telescope:disconnected',
  TELESCOPE_STATUS: 'telescope:status',
  TELESCOPE_ERROR: 'telescope:error',
  TELESCOPE_GOTO_STARTED: 'telescope:goto:started',
  TELESCOPE_GOTO_COMPLETE: 'telescope:goto:complete',

  // Imaging events
  IMAGING_STARTED: 'imaging:started',
  IMAGING_STOPPED: 'imaging:stopped',
  IMAGING_PROGRESS: 'imaging:progress',
  IMAGING_FRAME: 'imaging:frame',
  IMAGING_ERROR: 'imaging:error',

  // Focus events
  FOCUS_STARTED: 'focus:started',
  FOCUS_COMPLETE: 'focus:complete',
  FOCUS_PROGRESS: 'focus:progress',

  // Generic events
  COMMAND_RESPONSE: 'command:response',
  ERROR: 'error',
} as const

/**
 * Payload types for events
 */
export interface TelescopeStatusPayload {
  telescope_id: string
  ra?: number
  dec?: number
  alt?: number
  az?: number
  tracking?: boolean
  slewing?: boolean
  parked?: boolean
  focuser_position?: number
}

export interface TelescopeErrorPayload {
  telescope_id: string
  error: string
}

export interface ImagingProgressPayload {
  telescope_id: string
  frame_count: number
  exposure_ms: number
  gain: number
  target_name?: string
}

export interface GotoStartedPayload {
  telescope_id: string
  target_name: string
  ra: number
  dec: number
}

/**
 * Initialize Tauri event listeners
 * Sets up listeners for all telescope and imaging events
 */
export async function initializeTauriEvents(): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = []

  // Helper to check if toasts are enabled
  const shouldShowToast = () => useUIStore.getState().toastsEnabled

  // Telescope discovery events
  unlisteners.push(
    await listen(EventNames.TELESCOPE_DISCOVERED, (event) => {
      const payload = event.payload as TauriEventPayload
      console.log('Telescope discovered:', payload)

      const telescope = {
        id: payload.id as string || `${payload.host}:${payload.port}`,
        host: payload.host as string,
        port: payload.port as number,
        name: payload.name as string,
        serial_number: payload.serial_number as string | undefined,
        product_model: payload.product_model as string | undefined,
        status: 'disconnected' as const,
        discovery_method: 'auto',
      }

      useTelescopeStore.getState().addTelescope(telescope)
      useTelescopeStore.getState().addActivity(
        telescope.id,
        'info',
        `Discovered: ${telescope.name || telescope.host}`
      )

      if (shouldShowToast()) {
        toast({
          title: 'Telescope Discovered',
          description: telescope.name || telescope.host,
          variant: 'info',
        })
      }
    })
  )

  // Telescope connection events
  unlisteners.push(
    await listen(EventNames.TELESCOPE_CONNECTED, (event) => {
      const payload = event.payload as { id?: string; name?: string }
      console.log('Telescope connected:', payload)

      if (payload.id) {
        useTelescopeStore.getState().updateTelescope(payload.id, { status: 'connected' })
        useTelescopeStore.getState().addActivity(payload.id, 'success', 'Connected')

        if (shouldShowToast()) {
          toast({
            title: 'Connected',
            description: `Connected to ${payload.name || payload.id}`,
            variant: 'success',
          })
        }
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.TELESCOPE_DISCONNECTED, (event) => {
      const payload = event.payload as { id?: string; name?: string }
      console.log('Telescope disconnected:', payload)

      if (payload.id) {
        useTelescopeStore.getState().updateTelescope(payload.id, { status: 'disconnected' })
        useTelescopeStore.getState().addActivity(payload.id, 'info', 'Disconnected')

        if (shouldShowToast()) {
          toast({
            title: 'Disconnected',
            description: payload.name || payload.id,
            variant: 'default',
          })
        }
      }
    })
  )

  // Telescope status updates
  unlisteners.push(
    await listen(EventNames.TELESCOPE_STATUS, (event) => {
      const payload = event.payload as TelescopeStatusPayload

      if (payload.telescope_id) {
        useTelescopeStore.getState().updateTelescopeStatus(payload.telescope_id, {
          ra: payload.ra,
          dec: payload.dec,
          alt: payload.alt,
          az: payload.az,
          tracking: payload.tracking,
          slewing: payload.slewing,
          parked: payload.parked,
          focuserPosition: payload.focuser_position,
        })
      }
    })
  )

  // Telescope error events
  unlisteners.push(
    await listen(EventNames.TELESCOPE_ERROR, (event) => {
      const payload = event.payload as TelescopeErrorPayload
      console.error('Telescope error:', payload)

      if (payload.telescope_id) {
        useTelescopeStore.getState().updateTelescope(payload.telescope_id, {
          status: 'error',
          error: payload.error
        })
        useTelescopeStore.getState().addActivity(payload.telescope_id, 'error', payload.error)

        if (shouldShowToast()) {
          toast({
            title: 'Telescope Error',
            description: payload.error,
            variant: 'destructive',
          })
        }
      }
    })
  )

  // GOTO events
  unlisteners.push(
    await listen(EventNames.TELESCOPE_GOTO_STARTED, (event) => {
      const payload = event.payload as GotoStartedPayload

      if (payload.telescope_id) {
        useTelescopeStore.getState().updateTelescopeStatus(payload.telescope_id, { slewing: true })
        useTelescopeStore.getState().addActivity(
          payload.telescope_id,
          'info',
          `Slewing to ${payload.target_name}`
        )
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.TELESCOPE_GOTO_COMPLETE, (event) => {
      const payload = event.payload as { telescope_id: string; target_name: string }

      if (payload.telescope_id) {
        useTelescopeStore.getState().updateTelescopeStatus(payload.telescope_id, { slewing: false })
        useTelescopeStore.getState().addActivity(
          payload.telescope_id,
          'success',
          `Arrived at ${payload.target_name}`
        )

        if (shouldShowToast()) {
          toast({
            title: 'GOTO Complete',
            description: `Arrived at ${payload.target_name}`,
            variant: 'success',
          })
        }
      }
    })
  )

  // Imaging events
  unlisteners.push(
    await listen(EventNames.IMAGING_STARTED, (event) => {
      const payload = event.payload as ImagingProgressPayload
      console.log('Imaging started:', payload)

      if (payload.telescope_id) {
        useImagingStore.getState().startSession(payload.telescope_id, {
          exposure: payload.exposure_ms,
          gain: payload.gain,
          frameCount: 0,
          targetName: payload.target_name,
          isActive: true,
        })

        if (shouldShowToast()) {
          toast({
            title: 'Imaging Started',
            description: payload.target_name
              ? `Capturing ${payload.target_name}`
              : `${payload.exposure_ms}ms @ gain ${payload.gain}`,
            variant: 'info',
          })
        }
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.IMAGING_STOPPED, (event) => {
      const payload = event.payload as { telescope_id: string; frame_count?: number }
      console.log('Imaging stopped:', payload)

      if (payload.telescope_id) {
        useImagingStore.getState().stopSession(payload.telescope_id)

        if (shouldShowToast()) {
          toast({
            title: 'Imaging Stopped',
            description: payload.frame_count
              ? `Captured ${payload.frame_count} frames`
              : 'Imaging session ended',
            variant: 'default',
          })
        }
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.IMAGING_PROGRESS, (event) => {
      const payload = event.payload as ImagingProgressPayload

      if (payload.telescope_id) {
        useImagingStore.getState().updateSession(payload.telescope_id, {
          frameCount: payload.frame_count,
        })
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.IMAGING_FRAME, (event) => {
      const payload = event.payload as { telescope_id: string }

      if (payload.telescope_id) {
        useImagingStore.getState().incrementFrameCount(payload.telescope_id)
      }
    })
  )

  // Focus events
  unlisteners.push(
    await listen(EventNames.FOCUS_STARTED, (event) => {
      const payload = event.payload as { telescope_id: string }
      console.log('Focus started:', payload)

      if (payload.telescope_id) {
        useTelescopeStore.getState().addActivity(payload.telescope_id, 'info', 'Auto-focus started')
      }
    })
  )

  unlisteners.push(
    await listen(EventNames.FOCUS_COMPLETE, (event) => {
      const payload = event.payload as { telescope_id: string; position: number }
      console.log('Focus complete:', payload)

      if (payload.telescope_id) {
        useTelescopeStore.getState().updateTelescopeStatus(payload.telescope_id, {
          focuserPosition: payload.position,
        })
        useTelescopeStore.getState().addActivity(
          payload.telescope_id,
          'success',
          `Auto-focus complete: position ${payload.position}`
        )

        if (shouldShowToast()) {
          toast({
            title: 'Auto-focus Complete',
            description: `Position: ${payload.position}`,
            variant: 'success',
          })
        }
      }
    })
  )

  // Error events
  unlisteners.push(
    await listen(EventNames.ERROR, (event) => {
      const payload = event.payload as TauriEventPayload
      console.error('Tauri error event:', payload)

      // Add to activity log if we have a telescope ID
      if (payload.telescope_id) {
        useTelescopeStore.getState().addActivity(
          payload.telescope_id as string,
          'error',
          payload.message as string || 'Unknown error'
        )
      }
    })
  )

  console.log('Tauri event listeners initialized')
  return unlisteners
}

/**
 * Cleanup function to remove all event listeners
 */
export function cleanupTauriEvents(unlisteners: UnlistenFn[]): void {
  unlisteners.forEach(unlisten => unlisten())
  console.log('Tauri event listeners cleaned up')
}
