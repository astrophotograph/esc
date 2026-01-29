import { useCallback } from 'react'
import { invoke } from '../services/api'
import { useTelescopeStore, TelescopeInfo, TelescopeStatus } from '../stores'

// API response types
interface ApiResponse {
  success?: boolean
  error?: string
}

interface TelescopeDiscoveryResult {
  telescopes: Array<{
    host: string
    port: number
    serial_number?: string
    product_model?: string
    name?: string
  }>
}

interface TelescopeStatusResult {
  connected: boolean
  tracking?: boolean
  slewing?: boolean
  parked?: boolean
  ra?: number
  dec?: number
  alt?: number
  az?: number
}

/**
 * Hook for telescope operations
 */
export function useTelescope() {
  const {
    addTelescope,
    updateTelescope,
    removeTelescope,
    setCurrentTelescope,
    updateTelescopeStatus,
    addActivity,
    setIsDiscovering,
    currentTelescopeId,
    telescopes,
  } = useTelescopeStore()

  /**
   * Discover telescopes on the network
   */
  const discoverTelescopes = useCallback(async () => {
    setIsDiscovering(true)
    try {
      const result = await invoke<TelescopeDiscoveryResult | TelescopeDiscoveryResult['telescopes']>(
        'discover_telescopes'
      )
      const telescopesResult = Array.isArray(result)
        ? result
        : result.telescopes || []

      if (telescopesResult.length > 0) {
        for (const t of telescopesResult) {
          const telescope: TelescopeInfo = {
            id: `${t.host}:${t.port}`,
            host: t.host,
            port: t.port,
            name: t.name || `Telescope at ${t.host}`,
            serial_number: t.serial_number,
            product_model: t.product_model,
            status: 'disconnected',
            discovery_method: 'auto',
          }
          addTelescope(telescope)
        }
        addActivity('system', 'success', `Discovered ${telescopesResult.length} telescope(s)`)
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Discovery failed'
      addActivity('system', 'error', message)
      throw error
    } finally {
      setIsDiscovering(false)
    }
  }, [addTelescope, addActivity, setIsDiscovering])

  /**
   * Add a telescope manually by IP/port
   */
  const addTelescopeManual = useCallback(async (host: string, port: number, name?: string) => {
    try {
      const result = await invoke<ApiResponse>('add_telescope', {
        config: { host, port, name }
      })

      if (result.success) {
        const telescope: TelescopeInfo = {
          id: `${host}:${port}`,
          host,
          port,
          name: name || `Telescope at ${host}`,
          status: 'disconnected',
          discovery_method: 'manual',
        }
        addTelescope(telescope)
        addActivity(telescope.id, 'success', `Added telescope at ${host}:${port}`)
        return telescope
      } else {
        throw new Error(result.error || 'Failed to add telescope')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add telescope'
      addActivity('system', 'error', message)
      throw error
    }
  }, [addTelescope, addActivity])

  /**
   * Connect to a telescope
   */
  const connectTelescope = useCallback(async (telescopeId: string) => {
    updateTelescope(telescopeId, { status: 'connecting' })
    addActivity(telescopeId, 'info', 'Connecting...')

    try {
      const result = await invoke<ApiResponse>('connect_telescope', {
        telescopeId
      })

      if (result.success) {
        updateTelescope(telescopeId, { status: 'connected' })
        setCurrentTelescope(telescopeId)
        addActivity(telescopeId, 'success', 'Connected successfully')
        return true
      } else {
        throw new Error(result.error || 'Connection failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      updateTelescope(telescopeId, { status: 'error', error: message })
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescope, setCurrentTelescope, addActivity])

  /**
   * Disconnect from a telescope
   */
  const disconnectTelescope = useCallback(async (telescopeId: string) => {
    try {
      const result = await invoke<ApiResponse>('disconnect_telescope', {
        telescopeId
      })

      if (result.success) {
        updateTelescope(telescopeId, { status: 'disconnected' })
        if (currentTelescopeId === telescopeId) {
          setCurrentTelescope(null)
        }
        addActivity(telescopeId, 'info', 'Disconnected')
        return true
      } else {
        throw new Error(result.error || 'Disconnect failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Disconnect failed'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescope, setCurrentTelescope, currentTelescopeId, addActivity])

  /**
   * Remove a telescope
   */
  const removeTelescopeById = useCallback(async (telescopeId: string) => {
    try {
      await invoke<ApiResponse>('remove_telescope', { telescopeId })
      removeTelescope(telescopeId)
      addActivity('system', 'info', `Removed telescope ${telescopeId}`)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove telescope'
      addActivity('system', 'error', message)
      throw error
    }
  }, [removeTelescope, addActivity])

  /**
   * Get telescope status
   */
  const getTelescopeStatus = useCallback(async (telescopeId: string) => {
    try {
      const result = await invoke<TelescopeStatusResult>('get_telescope_status', {
        telescopeId
      })

      const status: TelescopeStatus = {
        ra: result.ra,
        dec: result.dec,
        alt: result.alt,
        az: result.az,
        tracking: result.tracking,
        slewing: result.slewing,
        parked: result.parked,
      }

      updateTelescopeStatus(telescopeId, status)
      return status
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get status'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescopeStatus, addActivity])

  /**
   * Go to a target
   */
  const gotoTarget = useCallback(async (
    telescopeId: string,
    targetName: string,
    ra: number,
    dec: number
  ) => {
    addActivity(telescopeId, 'info', `Slewing to ${targetName}...`)

    try {
      const result = await invoke<ApiResponse>('goto_target', {
        telescopeId,
        targetName,
        ra,
        dec,
      })

      if (result.success) {
        updateTelescopeStatus(telescopeId, { slewing: true })
        addActivity(telescopeId, 'success', `Started slewing to ${targetName}`)
        return true
      } else {
        throw new Error(result.error || 'GOTO failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GOTO failed'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescopeStatus, addActivity])

  /**
   * Stop GOTO motion
   */
  const stopGoto = useCallback(async (telescopeId: string) => {
    try {
      const result = await invoke<ApiResponse>('telescope_stop_goto', {
        telescopeId
      })

      if (result.success) {
        updateTelescopeStatus(telescopeId, { slewing: false })
        addActivity(telescopeId, 'info', 'Stopped slewing')
        return true
      } else {
        throw new Error(result.error || 'Stop failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescopeStatus, addActivity])

  /**
   * Park the telescope
   */
  const parkTelescope = useCallback(async (telescopeId: string) => {
    addActivity(telescopeId, 'info', 'Parking telescope...')

    try {
      const result = await invoke<ApiResponse>('park_telescope', {
        telescopeId
      })

      if (result.success) {
        updateTelescopeStatus(telescopeId, { parked: true, slewing: false })
        addActivity(telescopeId, 'success', 'Telescope parked')
        return true
      } else {
        throw new Error(result.error || 'Park failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Park failed'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescopeStatus, addActivity])

  /**
   * Move telescope in a direction
   */
  const moveTelescope = useCallback(async (
    telescopeId: string,
    direction: string,
    speed?: number,
    durationSec?: number
  ) => {
    try {
      const result = await invoke<ApiResponse>('telescope_move', {
        telescopeId,
        params: { direction, speed, duration_sec: durationSec }
      })

      if (result.success) {
        addActivity(telescopeId, 'info', `Moving ${direction}`)
        return true
      } else {
        throw new Error(result.error || 'Move failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Move failed'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [addActivity])

  /**
   * Stop telescope movement
   */
  const stopMove = useCallback(async (telescopeId: string) => {
    try {
      const result = await invoke<ApiResponse>('telescope_stop_move', {
        telescopeId
      })

      if (result.success) {
        addActivity(telescopeId, 'info', 'Movement stopped')
        return true
      } else {
        throw new Error(result.error || 'Stop failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [addActivity])

  /**
   * Set focuser position
   */
  const setFocus = useCallback(async (telescopeId: string, position: number) => {
    try {
      const result = await invoke<ApiResponse>('telescope_focus', {
        telescopeId,
        params: { position }
      })

      if (result.success) {
        updateTelescopeStatus(telescopeId, { focuserPosition: position })
        addActivity(telescopeId, 'info', `Focus set to ${position}`)
        return true
      } else {
        throw new Error(result.error || 'Focus failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Focus failed'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescopeStatus, addActivity])

  /**
   * Increment focus position
   */
  const focusIncrement = useCallback(async (telescopeId: string, steps: number) => {
    try {
      const result = await invoke<ApiResponse>('telescope_focus_increment', {
        telescopeId,
        steps
      })

      if (result.success) {
        addActivity(telescopeId, 'info', `Focus ${steps > 0 ? '+' : ''}${steps} steps`)
        return true
      } else {
        throw new Error(result.error || 'Focus increment failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Focus increment failed'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [addActivity])

  /**
   * Start auto focus
   */
  const autoFocus = useCallback(async (telescopeId: string) => {
    addActivity(telescopeId, 'info', 'Starting auto focus...')

    try {
      const result = await invoke<ApiResponse>('telescope_auto_focus', {
        telescopeId
      })

      if (result.success) {
        addActivity(telescopeId, 'success', 'Auto focus complete')
        return true
      } else {
        throw new Error(result.error || 'Auto focus failed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto focus failed'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [addActivity])

  /**
   * Get focuser position
   */
  const getFocuserPosition = useCallback(async (telescopeId: string) => {
    try {
      const result = await invoke<{ position: number }>('telescope_get_focuser_position', {
        telescopeId
      })

      updateTelescopeStatus(telescopeId, { focuserPosition: result.position })
      return result.position
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get focuser position'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateTelescopeStatus, addActivity])

  return {
    // State
    telescopes,
    currentTelescopeId,

    // Discovery
    discoverTelescopes,
    addTelescopeManual,

    // Connection
    connectTelescope,
    disconnectTelescope,
    removeTelescopeById,

    // Status
    getTelescopeStatus,

    // Movement
    gotoTarget,
    stopGoto,
    parkTelescope,
    moveTelescope,
    stopMove,

    // Focus
    setFocus,
    focusIncrement,
    autoFocus,
    getFocuserPosition,
  }
}
