import { useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, Download, Crosshair, Grid3x3 } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
// import { Slider } from './ui/slider'  // Enhancement UI disabled
import { Switch } from './ui/switch'
import { Label } from './ui/label'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'  // Enhancement UI disabled
import { useImaging } from '../hooks'
import type { ProcessedImage } from '../stores'

interface ImageViewerProps {
  image?: ProcessedImage
}

export function ImageViewer({ image: propImage }: ImageViewerProps) {
  const {
    currentImage,
    stretchModes,
    // Enhancement-related bindings disabled — feature not ported to Rust backend
    // enhancementMethods,
    // enhancementSettings,
    // currentStretchMode,
    // isProcessing,
    // setStretchMode,
    // setEnhancementSettings,
    getStretchModes,
    // getEnhancementMethods,
  } = useImaging()

  const image = propImage || currentImage

  const [zoom, setZoom] = useState(1)
  const [showCrosshair, setShowCrosshair] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  // const [showEnhancement, setShowEnhancement] = useState(false)  // Enhancement UI disabled

  // Load stretch modes and enhancement methods if not loaded
  useState(() => {
    if (stretchModes.length === 0) getStretchModes()
    // Enhancement methods loading disabled — feature not yet ported to Rust backend
    // if (!enhancementMethods) getEnhancementMethods()
  })

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.25, 5))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.25, 0.25))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoom(1)
  }, [])

  const handleDownload = useCallback(() => {
    if (!image?.dataBase64) return

    const link = document.createElement('a')
    link.href = `data:image/${image.format};base64,${image.dataBase64}`
    link.download = `${image.originalFilename.replace(/\.[^.]+$/, '')}_processed.${image.format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [image])

  if (!image) {
    return (
      <Card className="flex items-center justify-center h-96">
        <div className="text-center text-muted-foreground">
          <ZoomIn className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No image selected</p>
          <p className="text-sm">Process a FITS file to view it here</p>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ZoomIn className="h-5 w-5" />
            Image Viewer
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm w-16 text-center">{(zoom * 100).toFixed(0)}%</span>
            <Button variant="outline" size="icon" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleResetZoom}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
            {/* Enhancement toggle disabled — feature not yet ported to Rust backend
            <Button
              variant={showEnhancement ? 'default' : 'outline'}
              size="icon"
              onClick={() => setShowEnhancement(!showEnhancement)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            */}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex gap-4">
          {/* Main Image Area */}
          <div className="flex-1">
            {/* Overlay Controls */}
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="crosshair"
                  checked={showCrosshair}
                  onCheckedChange={setShowCrosshair}
                />
                <Label htmlFor="crosshair" className="flex items-center gap-1">
                  <Crosshair className="h-3 w-3" />
                  Crosshair
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="grid"
                  checked={showGrid}
                  onCheckedChange={setShowGrid}
                />
                <Label htmlFor="grid" className="flex items-center gap-1">
                  <Grid3x3 className="h-3 w-3" />
                  Grid
                </Label>
              </div>
            </div>

            {/* Image Container */}
            <div
              className="relative overflow-auto bg-black rounded-lg"
              style={{ maxHeight: '500px' }}
            >
              <div
                className="relative inline-block"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
              >
                <img
                  src={`data:image/${image.format};base64,${image.dataBase64}`}
                  alt={image.originalFilename}
                  className="max-w-none"
                />

                {/* Crosshair Overlay */}
                {showCrosshair && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-red-500/50" />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-red-500/50" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 border-2 border-red-500/50 rounded-full" />
                  </div>
                )}

                {/* Grid Overlay */}
                {showGrid && (
                  <div className="absolute inset-0 pointer-events-none">
                    <svg className="w-full h-full">
                      <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Image Info */}
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>{image.originalFilename}</span>
              <span>{image.width} x {image.height} • {image.format.toUpperCase()}</span>
              <span>Stretch: {image.stretchMode}</span>
            </div>
          </div>

          {/* Enhancement controls disabled — feature not yet ported to Rust backend
          {showEnhancement && (
            <div className="w-64 space-y-4">
              <div>
                <h4 className="font-medium mb-3">Stretch Mode</h4>
                <Select value={currentStretchMode} onValueChange={setStretchMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stretchModes.map((mode) => (
                      <SelectItem key={mode.id} value={mode.id}>
                        {mode.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {enhancementMethods && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Upscaling</Label>
                      <Switch
                        checked={enhancementSettings.upscaleEnabled}
                        onCheckedChange={(checked) =>
                          setEnhancementSettings({ upscaleEnabled: checked })
                        }
                      />
                    </div>
                    {enhancementSettings.upscaleEnabled && (
                      <div className="pl-4 space-y-2">
                        <Select
                          value={enhancementSettings.upscaleMethod}
                          onValueChange={(value) =>
                            setEnhancementSettings({ upscaleMethod: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {enhancementMethods.upscale.map((method) => (
                              <SelectItem key={method.id} value={method.id}>
                                {method.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <Label className="text-xs">Scale: {enhancementSettings.upscaleFactor}x</Label>
                          <Slider
                            value={[enhancementSettings.upscaleFactor]}
                            onValueChange={([value]) =>
                              setEnhancementSettings({ upscaleFactor: value })
                            }
                            min={1}
                            max={4}
                            step={0.5}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Denoising</Label>
                      <Switch
                        checked={enhancementSettings.denoiseEnabled}
                        onCheckedChange={(checked) =>
                          setEnhancementSettings({ denoiseEnabled: checked })
                        }
                      />
                    </div>
                    {enhancementSettings.denoiseEnabled && (
                      <div className="pl-4 space-y-2">
                        <Select
                          value={enhancementSettings.denoiseMethod}
                          onValueChange={(value) =>
                            setEnhancementSettings({ denoiseMethod: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {enhancementMethods.denoise.map((method) => (
                              <SelectItem key={method.id} value={method.id}>
                                {method.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <Label className="text-xs">
                            Strength: {(enhancementSettings.denoiseStrength * 100).toFixed(0)}%
                          </Label>
                          <Slider
                            value={[enhancementSettings.denoiseStrength]}
                            onValueChange={([value]) =>
                              setEnhancementSettings({ denoiseStrength: value })
                            }
                            min={0}
                            max={1}
                            step={0.05}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Sharpening</Label>
                      <Switch
                        checked={enhancementSettings.sharpenEnabled}
                        onCheckedChange={(checked) =>
                          setEnhancementSettings({ sharpenEnabled: checked })
                        }
                      />
                    </div>
                    {enhancementSettings.sharpenEnabled && (
                      <div className="pl-4 space-y-2">
                        <Select
                          value={enhancementSettings.sharpenMethod}
                          onValueChange={(value) =>
                            setEnhancementSettings({ sharpenMethod: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {enhancementMethods.sharpen.map((method) => (
                              <SelectItem key={method.id} value={method.id}>
                                {method.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <Label className="text-xs">
                            Strength: {(enhancementSettings.sharpenStrength * 100).toFixed(0)}%
                          </Label>
                          <Slider
                            value={[enhancementSettings.sharpenStrength]}
                            onValueChange={([value]) =>
                              setEnhancementSettings({ sharpenStrength: value })
                            }
                            min={0}
                            max={2}
                            step={0.1}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {isProcessing && (
                <div className="text-center py-4">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm mt-2">Processing...</p>
                </div>
              )}
            </div>
          )}
          */}
        </div>

        {/* Metadata */}
        {image.metadata && Object.keys(image.metadata).length > 0 && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 text-sm">FITS Metadata</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {Object.entries(image.metadata).slice(0, 8).map(([key, value]) => (
                <div key={key}>
                  <span className="text-muted-foreground">{key}:</span>{' '}
                  <span>{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
