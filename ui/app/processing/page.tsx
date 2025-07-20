"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Upload, Download, RefreshCw, Image as ImageIcon, AlertCircle, Loader2, Clock, FileImage, Trash2 } from "lucide-react"
import { ImageEnhancementControls } from "@/components/telescope/ImageEnhancementControls"

interface ProcessingState {
  isProcessing: boolean
  progress: number
  error: string | null
  originalImage: string | null
  processedImage: string | null
  fileName: string | null
  fileSize: number | null
  imageDimensions: { width: number; height: number } | null
  processingStartTime: number | null
  elapsedTime: number
}

interface PersistedFile {
  file_id: string
  filename: string
  file_size: number
  dimensions: { width: number; height: number }
  image_url: string
  upload_time: string
}

export default function ImageProcessingPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    error: null,
    originalImage: null,
    processedImage: null,
    fileName: null,
    fileSize: null,
    imageDimensions: null,
    processingStartTime: null,
    elapsedTime: 0
  })
  const [showEnhancementControls, setShowEnhancementControls] = useState(false)
  const [enhancementSettings, setEnhancementSettings] = useState({
    upscaling_enabled: false,
    scale_factor: 2.0,
    upscaling_method: "bicubic",
    sharpening_enabled: false,
    sharpening_method: "unsharp_mask",
    sharpening_strength: 1.0,
    denoise_enabled: false,
    denoise_method: "tv_chambolle",
    denoise_strength: 1.0,
    deconvolve_enabled: false,
    deconvolve_strength: 0.5,
    deconvolve_psf_size: 2.0,
    stretch_parameter: "15% Bg, 3 sigma",
    processing_order: ['upscaling', 'denoise', 'deconvolve', 'sharpening']
  })
  const [previewScale, setPreviewScale] = useState(100)
  const [scrollSync, setScrollSync] = useState({ left: 0, top: 0 })
  const [persistedFiles, setPersistedFiles] = useState<PersistedFile[]>([])
  const [showRecentFiles, setShowRecentFiles] = useState(false)
  
  // Load persisted files on component mount
  useEffect(() => {
    loadPersistedFiles()
  }, [])

  // Track elapsed time during processing
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (state.isProcessing && state.processingStartTime) {
      interval = setInterval(() => {
        setState(prev => ({
          ...prev,
          elapsedTime: Date.now() - (prev.processingStartTime || Date.now())
        }))
      }, 100) // Update every 100ms for smooth animation
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [state.isProcessing, state.processingStartTime])

  // Format elapsed time
  const formatElapsedTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    const remainingMs = Math.floor((ms % 1000) / 100)
    
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${remainingMs}s`
    } else {
      return `${remainingSeconds}.${remainingMs}s`
    }
  }

  // Calculate scale compensation for upscaled images
  const getProcessedImageScale = () => {
    if (enhancementSettings.upscaling_enabled) {
      return previewScale / enhancementSettings.scale_factor
    }
    return previewScale
  }

  const loadPersistedFiles = async () => {
    try {
      const response = await fetch('/api/processing/persisted-files')
      const result = await response.json()
      
      if (result.success && result.files) {
        setPersistedFiles(result.files)
        setShowRecentFiles(result.files.length > 0)
      }
    } catch (error) {
      console.error('Failed to load persisted files:', error)
    }
  }

  const loadPersistedFile = async (file: PersistedFile) => {
    // First set the file info
    setState(prev => ({
      ...prev,
      fileName: file.filename,
      fileSize: file.file_size,
      imageDimensions: file.dimensions,
      error: null
    }))
    
    try {
      // Re-process the original FITS file to ensure proper stretch is applied
      const response = await fetch('/api/processing/reprocess-fits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: file.file_id
        })
      })

      if (!response.ok) {
        // If re-processing fails, fall back to existing URL
        setState(prev => ({
          ...prev,
          originalImage: file.image_url,
          processedImage: file.image_url
        }))
      } else {
        const result = await response.json()
        setState(prev => ({
          ...prev,
          originalImage: result.image_url || file.image_url,
          processedImage: result.image_url || file.image_url,
          imageDimensions: result.dimensions || file.dimensions
        }))
      }
    } catch (error) {
      console.error('Failed to re-process persisted file:', error)
      // Fall back to existing URL
      setState(prev => ({
        ...prev,
        originalImage: file.image_url,
        processedImage: file.image_url
      }))
    }
    
    // Show enhancement controls when loading persisted file
    setShowEnhancementControls(true)
  }

  const deletePersistedFile = async (file: PersistedFile) => {
    try {
      const response = await fetch(`/api/processing/persisted-files/${file.file_id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (result.success) {
        // Refresh the persisted files list
        loadPersistedFiles()
        
        // If the deleted file is currently loaded, clear the state
        if (state.fileName === file.filename) {
          setState(prev => ({
            ...prev,
            originalImage: null,
            processedImage: null,
            fileName: null,
            fileSize: null,
            imageDimensions: null
          }))
          setShowEnhancementControls(false)
        }
      }
    } catch (error) {
      console.error('Failed to delete file:', error)
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : "Failed to delete file" 
      }))
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.fits') && !file.name.toLowerCase().endsWith('.fit')) {
      setState(prev => ({ ...prev, error: "Please upload a FITS file (.fits or .fit)" }))
      return
    }

    setState(prev => ({
      ...prev,
      isProcessing: true,
      progress: 10,
      error: null,
      fileName: file.name,
      fileSize: file.size
    }))

    try {
      // Create form data
      const formData = new FormData()
      formData.append('file', file)

      setState(prev => ({ ...prev, progress: 30 }))

      // Upload and process file
      const response = await fetch('/api/processing/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`)
      }

      setState(prev => ({ ...prev, progress: 60 }))

      const result = await response.json()

      setState(prev => ({
        ...prev,
        progress: 100,
        isProcessing: false,
        originalImage: result.imageUrl,
        processedImage: result.imageUrl,
        imageDimensions: result.dimensions
      }))

      // Auto-show enhancement controls after successful upload
      setShowEnhancementControls(true)
      
      // Refresh persisted files list
      loadPersistedFiles()

    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : "Failed to process file"
      }))
    }
  }

  const applyEnhancements = async () => {
    if (!state.originalImage) return

    const startTime = Date.now()
    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      error: null, 
      processingStartTime: startTime,
      elapsedTime: 0
    }))

    try {
      const response = await fetch('/api/processing/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: state.originalImage,
          settings: enhancementSettings
        })
      })

      if (!response.ok) {
        throw new Error(`Enhancement failed: ${response.statusText}`)
      }

      const result = await response.json()

      setState(prev => ({
        ...prev,
        isProcessing: false,
        processedImage: result.enhanced_image_url,
        processingStartTime: null
      }))

    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : "Failed to apply enhancements",
        processingStartTime: null
      }))
    }
  }

  const downloadProcessedImage = () => {
    if (!state.processedImage) return

    // Create download link
    const link = document.createElement('a')
    link.href = state.processedImage
    link.download = `processed_${state.fileName || 'image.fits'}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const resetProcessor = () => {
    setState({
      isProcessing: false,
      progress: 0,
      error: null,
      originalImage: null,
      processedImage: null,
      fileName: null,
      fileSize: null,
      imageDimensions: null
    })
    setShowEnhancementControls(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    // Refresh persisted files list
    loadPersistedFiles()
  }

  // Enhancement settings update handler - removed auto-apply to prevent unwanted processing
  const handleEnhancementSettingsChange = useCallback((newSettings: any) => {
    setEnhancementSettings(prev => ({ ...prev, ...newSettings }))
    // Removed auto-apply to prevent processing before user clicks "Apply"
  }, [])

  // Scroll synchronization handler
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollTop } = event.currentTarget
    setScrollSync({ left: scrollLeft, top: scrollTop })
    
    // Sync scroll position to all other comparison containers
    const containers = document.querySelectorAll('[data-sync-scroll]')
    containers.forEach((container) => {
      if (container !== event.currentTarget && container instanceof HTMLElement) {
        container.scrollLeft = scrollLeft
        container.scrollTop = scrollTop
      }
    })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-4 max-w-none">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Image Processing</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload FITS files and apply advanced image enhancements
          </p>
        </div>

      {/* Upload Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload FITS File
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".fits,.fit"
                onChange={handleFileUpload}
                className="hidden"
                id="fits-upload"
              />
              <label
                htmlFor="fits-upload"
                className="cursor-pointer flex flex-col items-center gap-4"
              >
                <Upload className="w-12 h-12 text-gray-400" />
                <div>
                  <p className="text-lg font-medium">Drop your FITS file here or click to browse</p>
                  <p className="text-sm text-gray-500 mt-1">Supports .fits and .fit files</p>
                </div>
                <Button variant="outline" disabled={state.isProcessing}>
                  Select File
                </Button>
              </label>
            </div>

            {state.fileName && (
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <p className="font-medium">{state.fileName}</p>
                  <p className="text-sm text-gray-500">
                    {state.fileSize ? `${(state.fileSize / 1024 / 1024).toFixed(2)} MB` : ''}
                    {state.imageDimensions && ` • ${state.imageDimensions.width} × ${state.imageDimensions.height}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetProcessor}
                  disabled={state.isProcessing}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            )}

            {state.isProcessing && (
              <div className="space-y-2">
                <Progress value={state.progress} className="w-full" />
                <p className="text-sm text-center text-gray-500">Processing...</p>
              </div>
            )}

            {state.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Files Section */}
      {showRecentFiles && persistedFiles.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent FITS Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {persistedFiles.slice(0, 6).map((file) => (
                <div
                  key={file.file_id}
                  className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <FileImage className="w-8 h-8 text-blue-500 flex-shrink-0" />
                    <div 
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => loadPersistedFile(file)}
                    >
                      <p className="font-medium truncate" title={file.filename}>
                        {file.filename}
                      </p>
                      <p className="text-sm text-gray-500">
                        {(file.file_size / 1024 / 1024).toFixed(2)} MB • {file.dimensions.width} × {file.dimensions.height}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        deletePersistedFile(file)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {persistedFiles.length > 6 && (
              <p className="text-sm text-gray-500 mt-4 text-center">
                And {persistedFiles.length - 6} more files...
              </p>
            )}
          </CardContent>
        </Card>
      )}

        {/* Main Content - Split Layout */}
        {(state.originalImage || state.processedImage) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Enhancement Controls */}
            {showEnhancementControls && (
              <div className="lg:col-span-1">
                <Card className="sticky top-4">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5" />
                      Enhancement Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Button
                        onClick={applyEnhancements}
                        disabled={state.isProcessing || !state.originalImage}
                        className="w-full"
                      >
                        {state.isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          "Apply Enhancements"
                        )}
                      </Button>
                      <ImageEnhancementControls
                        settings={enhancementSettings}
                        onChange={handleEnhancementSettingsChange}
                        onApply={applyEnhancements}
                        disabled={state.isProcessing}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Right Column - Image Preview */}
            <div className={showEnhancementControls ? "lg:col-span-2" : "lg:col-span-3"}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Image Preview</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="zoom-slider" className="text-sm">Zoom:</Label>
                        <Slider
                          id="zoom-slider"
                          value={[previewScale]}
                          onValueChange={([value]) => setPreviewScale(value)}
                          min={25}
                          max={300}
                          step={25}
                          className="w-32"
                        />
                        <span className="text-sm w-12">{previewScale}%</span>
                      </div>
                      {enhancementSettings.upscaling_enabled && (
                        <span className="text-xs text-gray-500 italic">
                          Processed image auto-scaled to match original
                        </span>
                      )}
                      {state.processedImage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadProcessedImage}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="comparison" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="original">Original (15% Bg, 3σ)</TabsTrigger>
                      <TabsTrigger value="processed" className="relative">
                        Processed
                        {state.isProcessing && (
                          <div className="absolute -top-1 -right-1">
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                          </div>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="comparison">Side by Side</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="original" className="mt-4">
                      <div className="relative">
                        {/* Fixed header for original image */}
                        <div className="bg-gray-100 dark:bg-gray-900 rounded-t-lg p-4 pb-2 border-b border-gray-300 dark:border-gray-700">
                          <h3 className="text-center font-medium">Original (15% Bg, 3σ)</h3>
                        </div>
                        <div className="overflow-auto max-h-[60vh] bg-gray-100 dark:bg-gray-900 rounded-b-lg p-4 pt-2">
                          {state.originalImage && (
                            <div style={{ transform: `scale(${previewScale / 100})`, transformOrigin: 'top left' }}>
                              <img
                                src={state.originalImage}
                                alt="Original"
                                className="max-w-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="processed" className="mt-4">
                      <div className="space-y-4">
                        {/* Processing feedback */}
                        {state.isProcessing && (
                          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                  Processing image...
                                </div>
                                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                  Applying {enhancementSettings.processing_order?.filter(step => {
                                    switch (step) {
                                      case 'upscaling': return enhancementSettings.upscaling_enabled
                                      case 'denoise': return enhancementSettings.denoise_enabled
                                      case 'deconvolve': return enhancementSettings.deconvolve_enabled
                                      case 'sharpening': return enhancementSettings.sharpening_enabled
                                      default: return false
                                    }
                                  }).map(step => {
                                    switch (step) {
                                      case 'upscaling': return 'Super Resolution'
                                      case 'denoise': return 'Denoising'
                                      case 'deconvolve': return 'Deconvolution'
                                      case 'sharpening': return 'Sharpening'
                                      default: return step
                                    }
                                  }).join(' → ') || 'No enhancements selected'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                                <Clock className="w-4 h-4" />
                                <span className="text-sm font-mono">
                                  {formatElapsedTime(state.elapsedTime)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="relative">
                          {/* Fixed header outside the scrollable area */}
                          <div className="bg-gray-100 dark:bg-gray-900 rounded-t-lg p-4 pb-2 border-b border-gray-300 dark:border-gray-700">
                            <div className="flex justify-between items-center">
                              <h3 className="font-medium">Processed ({enhancementSettings.stretch_parameter})</h3>
                              {!state.isProcessing && state.elapsedTime > 0 && (
                                <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                  <Clock className="w-3 h-3" />
                                  <span>Processed in {formatElapsedTime(state.elapsedTime)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Scrollable content area */}
                          <div className="overflow-auto max-h-[60vh] bg-gray-100 dark:bg-gray-900 rounded-b-lg p-4 pt-2">
                            {state.processedImage && (
                              <div style={{ transform: `scale(${getProcessedImageScale() / 100})`, transformOrigin: 'top left' }}>
                                <img
                                  src={state.processedImage}
                                  alt="Processed"
                                  className="max-w-none"
                                />
                              </div>
                            )}
                            {state.isProcessing && !state.processedImage && (
                              <div className="flex items-center justify-center h-40 text-gray-500">
                                <div className="text-center">
                                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                  <p>Processing your image...</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="comparison" className="mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                          {/* Fixed header for original image */}
                          <div className="bg-gray-100 dark:bg-gray-900 rounded-t-lg p-4 pb-2 border-b border-gray-300 dark:border-gray-700">
                            <h3 className="text-center font-medium">Original (15% Bg, 3σ)</h3>
                          </div>
                          <div 
                            className="overflow-auto max-h-[60vh] bg-gray-100 dark:bg-gray-900 rounded-b-lg p-4 pt-2"
                            data-sync-scroll
                            onScroll={handleScroll}
                          >
                            {state.originalImage && (
                              <div style={{ transform: `scale(${previewScale / 100})`, transformOrigin: 'top left' }}>
                                <img
                                  src={state.originalImage}
                                  alt="Original"
                                  className="max-w-none"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="relative">
                          {/* Fixed header for processed image */}
                          <div className="bg-gray-100 dark:bg-gray-900 rounded-t-lg p-4 pb-2 border-b border-gray-300 dark:border-gray-700">
                            <div className="flex justify-between items-center">
                              <h3 className="text-center font-medium">Processed ({enhancementSettings.stretch_parameter})</h3>
                              {!state.isProcessing && state.elapsedTime > 0 && (
                                <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatElapsedTime(state.elapsedTime)}</span>
                                </div>
                              )}
                              {state.isProcessing && (
                                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{formatElapsedTime(state.elapsedTime)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div 
                            className="overflow-auto max-h-[60vh] bg-gray-100 dark:bg-gray-900 rounded-b-lg p-4 pt-2"
                            data-sync-scroll
                            onScroll={handleScroll}
                          >
                            {state.processedImage && (
                              <div style={{ transform: `scale(${getProcessedImageScale() / 100})`, transformOrigin: 'top left' }}>
                                <img
                                  src={state.processedImage}
                                  alt="Processed"
                                  className="max-w-none"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}