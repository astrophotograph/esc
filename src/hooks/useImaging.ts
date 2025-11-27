import { useCallback } from 'react'
import { invoke } from '../services/api'
import { useImagingStore, useTelescopeStore, ProcessedImage, EnhancementSettings } from '../stores'

// API response types
interface ImagingResponse {
  success?: boolean
  error?: string
}

interface ProcessedImageResult {
  id: string
  original_filename: string
  processed_at: string
  width: number
  height: number
  format: string
  stretch_mode: string
  metadata: Record<string, unknown>
  data_base64?: string
}

interface EnhancementMethodsResult {
  upscale: Array<{ id: string; name: string; description: string }>
  denoise: Array<{ id: string; name: string; description: string }>
  sharpen: Array<{ id: string; name: string; description: string }>
}

interface PlateSolveResult {
  status: string
  job_id?: string
  submission_id?: string
  ra?: number
  dec?: number
  orientation?: number
  pixscale?: number
  radius?: number
  width_deg?: number
  height_deg?: number
  objects_in_field?: string[]
  error?: string
}

/**
 * Hook for imaging operations
 */
export function useImaging() {
  const { addActivity } = useTelescopeStore()
  const {
    startSession,
    stopSession,
    updateSession,
    addProcessedImage,
    removeProcessedImage,
    setCurrentImage,
    setStretchModes,
    setEnhancementMethods,
    updateEnhancementSettings,
    setCurrentStretchMode,
    setPlateSolveResult,
    setIsProcessing,
    setIsPlateSolving,
    sessions,
    processedImages,
    currentImage,
    stretchModes,
    enhancementMethods,
    enhancementSettings,
    currentStretchMode,
    plateSolveResult,
    isProcessing,
    isPlateSolving,
  } = useImagingStore()

  /**
   * Start imaging session
   */
  const startImaging = useCallback(async (
    telescopeId: string,
    exposure: number,
    gain: number,
    targetName?: string
  ) => {
    try {
      const result = await invoke<ImagingResponse>('imaging_start', {
        telescopeId,
        exposureMs: exposure,
        gain,
        targetName,
      })

      if (result.success) {
        startSession(telescopeId, {
          exposure,
          gain,
          targetName,
          frameCount: 0,
          isActive: true,
        })
        addActivity(telescopeId, 'success', `Started imaging: ${exposure}ms, gain ${gain}`)
        return true
      } else {
        throw new Error(result.error || 'Failed to start imaging')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start imaging'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [startSession, addActivity])

  /**
   * Stop imaging session
   */
  const stopImaging = useCallback(async (telescopeId: string) => {
    try {
      const result = await invoke<ImagingResponse>('imaging_stop', {
        telescopeId,
      })

      if (result.success) {
        stopSession(telescopeId)
        addActivity(telescopeId, 'info', 'Imaging stopped')
        return true
      } else {
        throw new Error(result.error || 'Failed to stop imaging')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop imaging'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [stopSession, addActivity])

  /**
   * Set camera gain
   */
  const setGain = useCallback(async (telescopeId: string, gain: number) => {
    try {
      const result = await invoke<ImagingResponse>('telescope_set_gain', {
        telescopeId,
        gain,
      })

      if (result.success) {
        updateSession(telescopeId, { gain })
        return true
      } else {
        throw new Error(result.error || 'Failed to set gain')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set gain'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateSession, addActivity])

  /**
   * Set exposure time
   */
  const setExposure = useCallback(async (telescopeId: string, exposureMs: number) => {
    try {
      const result = await invoke<ImagingResponse>('telescope_set_exposure', {
        telescopeId,
        exposureMs,
      })

      if (result.success) {
        updateSession(telescopeId, { exposure: exposureMs })
        return true
      } else {
        throw new Error(result.error || 'Failed to set exposure')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set exposure'
      addActivity(telescopeId, 'error', message)
      throw error
    }
  }, [updateSession, addActivity])

  /**
   * Process a FITS file
   */
  const processFits = useCallback(async (
    fitsPath: string,
    stretchMode?: string,
    outputFormat?: string,
    returnData: boolean = true
  ) => {
    setIsProcessing(true)

    try {
      const resultJson = await invoke<string>('imaging_process_fits', {
        params: {
          fits_path: fitsPath,
          stretch_mode: stretchMode || currentStretchMode,
          output_format: outputFormat || 'png',
          return_data: returnData,
        }
      })

      const result: ProcessedImageResult = JSON.parse(resultJson)

      const processedImage: ProcessedImage = {
        id: result.id,
        originalFilename: result.original_filename,
        processedAt: result.processed_at,
        width: result.width,
        height: result.height,
        format: result.format,
        stretchMode: result.stretch_mode,
        metadata: result.metadata,
        dataBase64: result.data_base64,
      }

      addProcessedImage(processedImage)
      setCurrentImage(processedImage)

      return processedImage
    } catch (error) {
      console.error('FITS processing failed:', error)
      throw error
    } finally {
      setIsProcessing(false)
    }
  }, [currentStretchMode, addProcessedImage, setCurrentImage, setIsProcessing])

  /**
   * Enhance an image
   */
  const enhanceImage = useCallback(async (
    imagePath: string,
    settings?: Partial<EnhancementSettings>,
    returnData: boolean = true
  ) => {
    setIsProcessing(true)

    const params = {
      image_path: imagePath,
      upscale_enabled: settings?.upscaleEnabled ?? enhancementSettings.upscaleEnabled,
      upscale_factor: settings?.upscaleFactor ?? enhancementSettings.upscaleFactor,
      upscale_method: settings?.upscaleMethod ?? enhancementSettings.upscaleMethod,
      denoise_enabled: settings?.denoiseEnabled ?? enhancementSettings.denoiseEnabled,
      denoise_method: settings?.denoiseMethod ?? enhancementSettings.denoiseMethod,
      denoise_strength: settings?.denoiseStrength ?? enhancementSettings.denoiseStrength,
      sharpen_enabled: settings?.sharpenEnabled ?? enhancementSettings.sharpenEnabled,
      sharpen_method: settings?.sharpenMethod ?? enhancementSettings.sharpenMethod,
      sharpen_strength: settings?.sharpenStrength ?? enhancementSettings.sharpenStrength,
      deconvolution_enabled: settings?.deconvolutionEnabled ?? enhancementSettings.deconvolutionEnabled,
      deconvolution_strength: settings?.deconvolutionStrength ?? enhancementSettings.deconvolutionStrength,
      psf_size: settings?.psfSize ?? enhancementSettings.psfSize,
      return_data: returnData,
    }

    try {
      const resultJson = await invoke<string>('imaging_enhance', { params })
      const result: ProcessedImageResult = JSON.parse(resultJson)

      const processedImage: ProcessedImage = {
        id: result.id,
        originalFilename: result.original_filename,
        processedAt: result.processed_at,
        width: result.width,
        height: result.height,
        format: result.format,
        stretchMode: result.stretch_mode,
        metadata: result.metadata,
        dataBase64: result.data_base64,
      }

      addProcessedImage(processedImage)
      setCurrentImage(processedImage)

      return processedImage
    } catch (error) {
      console.error('Image enhancement failed:', error)
      throw error
    } finally {
      setIsProcessing(false)
    }
  }, [enhancementSettings, addProcessedImage, setCurrentImage, setIsProcessing])

  /**
   * Get available stretch modes
   */
  const getStretchModes = useCallback(async () => {
    try {
      const resultJson = await invoke<string>('imaging_get_stretch_modes')
      const result = JSON.parse(resultJson)
      setStretchModes(result)
      return result
    } catch (error) {
      console.error('Failed to get stretch modes:', error)
      return []
    }
  }, [setStretchModes])

  /**
   * Get available enhancement methods
   */
  const getEnhancementMethods = useCallback(async () => {
    try {
      const resultJson = await invoke<string>('imaging_get_enhancement_methods')
      const result: EnhancementMethodsResult = JSON.parse(resultJson)
      setEnhancementMethods(result)
      return result
    } catch (error) {
      console.error('Failed to get enhancement methods:', error)
      return null
    }
  }, [setEnhancementMethods])

  /**
   * Plate solve an image
   */
  const plateSolve = useCallback(async (
    imagePath?: string,
    imageBase64?: string,
    options?: {
      apiKey?: string
      scaleLower?: number
      scaleUpper?: number
      centerRa?: number
      centerDec?: number
      radius?: number
      downsampleFactor?: number
      timeout?: number
    }
  ) => {
    setIsPlateSolving(true)
    setPlateSolveResult({ status: 'pending' })

    try {
      const resultJson = await invoke<string>('imaging_plate_solve', {
        params: {
          image_path: imagePath,
          image_base64: imageBase64,
          api_key: options?.apiKey,
          scale_lower: options?.scaleLower,
          scale_upper: options?.scaleUpper,
          center_ra: options?.centerRa,
          center_dec: options?.centerDec,
          radius: options?.radius,
          downsample_factor: options?.downsampleFactor,
          timeout: options?.timeout,
        }
      })

      const result: PlateSolveResult = JSON.parse(resultJson)

      const solveResult = {
        status: result.status as 'pending' | 'processing' | 'success' | 'failed' | 'timeout',
        jobId: result.job_id,
        submissionId: result.submission_id,
        ra: result.ra,
        dec: result.dec,
        orientation: result.orientation,
        pixscale: result.pixscale,
        radius: result.radius,
        widthDeg: result.width_deg,
        heightDeg: result.height_deg,
        objectsInField: result.objects_in_field,
        error: result.error,
      }

      setPlateSolveResult(solveResult)
      return solveResult
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Plate solve failed'
      setPlateSolveResult({ status: 'failed', error: message })
      throw error
    } finally {
      setIsPlateSolving(false)
    }
  }, [setPlateSolveResult, setIsPlateSolving])

  /**
   * Delete a processed image
   */
  const deleteProcessedImage = useCallback(async (imageId: string) => {
    try {
      await invoke<boolean>('imaging_cleanup', { imageId })
      removeProcessedImage(imageId)
      return true
    } catch (error) {
      console.error('Failed to delete image:', error)
      throw error
    }
  }, [removeProcessedImage])

  return {
    // State
    sessions,
    processedImages,
    currentImage,
    stretchModes,
    enhancementMethods,
    enhancementSettings,
    currentStretchMode,
    plateSolveResult,
    isProcessing,
    isPlateSolving,

    // Session actions
    startImaging,
    stopImaging,
    setGain,
    setExposure,

    // Image processing
    processFits,
    enhanceImage,
    deleteProcessedImage,

    // Settings
    getStretchModes,
    getEnhancementMethods,
    setStretchMode: setCurrentStretchMode,
    setEnhancementSettings: updateEnhancementSettings,

    // Plate solving
    plateSolve,
  }
}
