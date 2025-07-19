/**
 * Sky Map page with DeckGL tile rendering
 * Shows the entire celestial sphere with zoom and pan controls
 */
'use client'

import React, { useState, useCallback, useMemo } from 'react'
import DeckGL from '@deck.gl/react'
import { TileLayer } from '@deck.gl/geo-layers'
import { BitmapLayer } from '@deck.gl/layers'
import { MapView } from '@deck.gl/core'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Telescope, ZoomIn, ZoomOut, Home, Info } from 'lucide-react'

interface SkyViewState {
  longitude: number
  latitude: number
  zoom: number
  bearing: number
  pitch: number
}

interface SkyMapInfo {
  tile_width: number
  tile_height: number
  max_zoom_level: number
  total_tiles_at_max_zoom: number
  angular_coverage: Record<string, any>
  supported_projections: string[]
  starplot_available: boolean
}

export default function SkyMapPage() {
  // View state for DeckGL - using longitude/latitude for astronomical coordinates
  const [viewState, setViewState] = useState({
    longitude: 0,  // RA center
    latitude: 0,   // Dec center  
    zoom: 0,
    bearing: 0,
    pitch: 0
  })

  // Sky map settings
  const [projection, setProjection] = useState('mercator')
  const [style, setStyle] = useState('default')
  const [latitude, setLatitude] = useState(40.0)
  const [longitude, setLongitude] = useState(-74.0)
  const [skyMapInfo, setSkyMapInfo] = useState<SkyMapInfo | null>(null)

  // Load sky map info on component mount
  React.useEffect(() => {
    fetch('/api/skymap/info')
      .then(res => res.json())
      .then(setSkyMapInfo)
      .catch(console.error)
  }, [])

  // Build tile URL template
  const tileUrlTemplate = useMemo(() => {
    const params = new URLSearchParams({
      projection,
      style,
      latitude: latitude.toString(),
      longitude: longitude.toString()
    })
    return `/api/skymap/tile/{z}/{x}/{y}?${params}`
  }, [projection, style, latitude, longitude])

  // Create the tile layer with proper zoom support
  const tileLayer = useMemo(() => new TileLayer({
    id: 'sky-tiles',
    data: tileUrlTemplate,
    
    // Basic tile parameters
    minZoom: 0,
    maxZoom: skyMapInfo?.max_zoom_level || 4,
    tileSize: 512,  // Standard tile size for DeckGL coordinate calculations
    
    // Custom extent to cover the full celestial sphere
    extent: [-180, -90, 180, 90],  // [west, south, east, north] in degrees
    
    // Enable refinement strategy for smoother loading
    refinementStrategy: 'best-available',
    
    // Render each tile as a bitmap
    renderSubLayers: (props: any) => {
      const { data, tile } = props
      
      if (!data) return null

      // Calculate bounds for this tile in celestial coordinates
      const { x, y, z } = tile.index
      const tileCount = Math.pow(2, z)
      
      // Map celestial coordinates to display coordinates
      // For sky mapping, we need to preserve the 2:1 aspect ratio (360° RA : 180° Dec)
      // RA: 0-360° maps to full width, Dec: -90° to +90° maps to full height
      
      // Calculate RA bounds (Right Ascension: 0-360°)
      const raPerTile = 360 / tileCount
      const raMin = x * raPerTile
      const raMax = (x + 1) * raPerTile
      
      // Calculate Dec bounds (Declination: -90° to +90°)  
      const decPerTile = 180 / tileCount
      const decMax = 90 - (y * decPerTile)
      const decMin = 90 - ((y + 1) * decPerTile)
      
      // Map to longitude/latitude for DeckGL display
      // For celestial coordinates, we map RA directly to longitude (0-360° → -180 to +180)
      // and Dec directly to latitude (-90° to +90°)
      const west = raMin - 180  // Convert RA to longitude range
      const east = raMax - 180
      const south = decMin
      const north = decMax

      // Tile bounds are calculated correctly for 2:1 celestial sphere aspect ratio

      return new BitmapLayer({
        id: `sky-tile-${x}-${y}-${z}`,
        image: data,
        bounds: [west, south, east, north],
        pickable: false,
        visible: true,
        // Ensure proper opacity for visibility
        opacity: 1.0,
      })
    },

    // Update triggers
    updateTriggers: {
      data: [tileUrlTemplate]
    }
  }), [tileUrlTemplate, skyMapInfo])

  // Control handlers
  const handleZoomIn = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      zoom: Math.min(prev.zoom + 1, skyMapInfo?.max_zoom_level || 4)
    }))
  }, [skyMapInfo])

  const handleZoomOut = useCallback(() => {
    setViewState(prev => ({
      ...prev,
      zoom: Math.max(prev.zoom - 1, 0)
    }))
  }, [])

  const handleResetView = useCallback(() => {
    setViewState({
      longitude: 0,
      latitude: 0, 
      zoom: 0,
      bearing: 0,
      pitch: 0
    })
  }, [])

  const currentZoomLevel = Math.floor(viewState.zoom)
  const tilesAtCurrentZoom = skyMapInfo?.angular_coverage?.[`zoom_${currentZoomLevel}`]

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-background border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Telescope className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Sky Map</h1>
            <Badge variant="secondary">
              {skyMapInfo?.starplot_available ? 'Starplot Active' : 'Starplot Unavailable'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4">
            {/* View controls */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-mono min-w-[60px] text-center">
                Z: {currentZoomLevel}
              </span>
              <Button size="sm" variant="outline" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleResetView}>
                <Home className="h-4 w-4" />
              </Button>
            </div>

            {/* Projection display */}
            <div className="text-sm bg-muted px-3 py-2 rounded">
              Projection: Mercator
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Side panel */}
        <div className="w-80 bg-muted/30 border-r p-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5" />
                Observer Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Latitude</label>
                <Slider
                  value={[latitude]}
                  onValueChange={([value]) => setLatitude(value)}
                  min={-90}
                  max={90}
                  step={0.1}
                  className="mt-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {latitude.toFixed(1)}°
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Longitude</label>
                <Slider
                  value={[longitude]}
                  onValueChange={([value]) => setLongitude(value)}
                  min={-180}
                  max={180}
                  step={0.1}
                  className="mt-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {longitude.toFixed(1)}°
                </div>
              </div>
            </CardContent>
          </Card>

          {tilesAtCurrentZoom && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Current Zoom Level</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Level: {currentZoomLevel}</div>
                  <div>Grid: {tilesAtCurrentZoom.tiles_per_axis}×{tilesAtCurrentZoom.tiles_per_axis}</div>
                  <div>Total tiles: {tilesAtCurrentZoom.total_tiles}</div>
                  <div>Per tile: {tilesAtCurrentZoom.degrees_per_tile.toFixed(1)}°</div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">View State</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm font-mono space-y-1">
                <div>RA: {viewState.longitude.toFixed(1)}°</div>
                <div>Dec: {viewState.latitude.toFixed(1)}°</div>
                <div>Zoom: {viewState.zoom.toFixed(2)}</div>
                <div>Bearing: {viewState.bearing.toFixed(1)}°</div>
                <div>Pitch: {viewState.pitch.toFixed(1)}°</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* DeckGL map */}
        <div className="flex-1 relative bg-black">
          <DeckGL
            viewState={viewState}
            onViewStateChange={({ viewState: newViewState }) => setViewState(newViewState as SkyViewState)}
            controller={true}
            layers={[tileLayer]}
            views={[new MapView({ id: 'sky-view' })]}
            getCursor={() => 'crosshair'}
            // Set a dark background for the sky map
            style={{ backgroundColor: '#000000' }}
            // Enable WebGL for proper rendering
            useDevicePixels={true}
          >
            {/* Loading overlay */}
            {!skyMapInfo?.starplot_available && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Card className="p-6">
                  <CardContent className="text-center">
                    <h3 className="text-lg font-semibold mb-2">Starplot Unavailable</h3>
                    <p className="text-sm text-muted-foreground">
                      Install Starplot to enable sky map tiles
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </DeckGL>
        </div>
      </div>
    </div>
  )
}