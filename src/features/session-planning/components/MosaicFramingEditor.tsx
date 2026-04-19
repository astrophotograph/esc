import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, ZoomIn, ZoomOut, Maximize2, Crosshair } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog'
import { Button } from '../../../components/ui/button'
import { Slider } from '../../../components/ui/slider'
import { Label } from '../../../components/ui/label'
import { useSchedulerStore } from '../../../stores/schedulerStore'
import type { MosaicConfig } from '../../../stores/schedulerStore'

interface MosaicFramingEditorProps {
  targetId: number
  targetName: string
  raDec: [number, number]
  initial: MosaicConfig | null
  open: boolean
  onClose: () => void
}

function isTrivial(scale: number, angle: number, panX: number, panY: number, zoom: number): boolean {
  return scale === 1.0 && angle === 0.0 && panX === 0 && panY === 0 && zoom === DEFAULT_ZOOM
}

const SVG_SIZE = 512
const CX = SVG_SIZE / 2
const CY = SVG_SIZE / 2

// 12° image — large enough to frame extended objects like the Cygnus Loop (~3°)
const IMG_DEG = 12.0
const IMG_ARCMIN = IMG_DEG * 60
const BASE_W = SVG_SIZE * (89 / IMG_ARCMIN)
const BASE_H = SVG_SIZE * (56 / IMG_ARCMIN)

// zoom=1.0 → full 12° field; zoom=4.0 → 3° field (default)
const MIN_ZOOM = 0.5   // allows 24° effective field
const MAX_ZOOM = 12.0
const DEFAULT_ZOOM = 4.0

function skyViewUrl(ra: number, dec: number): string {
  return (
    `https://alasky.cds.unistra.fr/hips-image-services/hips2fits` +
    `?hips=CDS%2FP%2FDSS2%2Fcolor` +
    `&width=2048&height=2048` +
    `&fov=${IMG_DEG}&projection=TAN&coordsys=icrs` +
    `&ra=${ra.toFixed(6)}&dec=${dec.toFixed(6)}&format=jpg`
  )
}

const TICK = 12

function CornerMarks({ hw, hh, sw }: { hw: number; hh: number; sw: number }) {
  const t = Math.min(TICK, hw * 0.3, hh * 0.3)
  const c = '#818cf8'
  return (
    <>
      <line x1={-hw} y1={-hh} x2={-hw + t} y2={-hh} stroke={c} strokeWidth={sw} />
      <line x1={-hw} y1={-hh} x2={-hw} y2={-hh + t} stroke={c} strokeWidth={sw} />
      <line x1={hw}  y1={-hh} x2={hw - t}  y2={-hh} stroke={c} strokeWidth={sw} />
      <line x1={hw}  y1={-hh} x2={hw}  y2={-hh + t} stroke={c} strokeWidth={sw} />
      <line x1={-hw} y1={hh}  x2={-hw + t} y2={hh}  stroke={c} strokeWidth={sw} />
      <line x1={-hw} y1={hh}  x2={-hw} y2={hh - t}  stroke={c} strokeWidth={sw} />
      <line x1={hw}  y1={hh}  x2={hw - t}  y2={hh}  stroke={c} strokeWidth={sw} />
      <line x1={hw}  y1={hh}  x2={hw}  y2={hh - t}  stroke={c} strokeWidth={sw} />
    </>
  )
}

type DragMode = 'view' | 'fov'

interface DragState {
  mode: DragMode
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
  vbSize: number
  svgWidth: number
}

export function MosaicFramingEditor({
  targetId,
  targetName,
  raDec,
  initial,
  open,
  onClose,
}: MosaicFramingEditorProps) {
  const updateTarget = useSchedulerStore((s) => s.updateTarget)

  const [scale, setScale] = useState(initial?.scale ?? 1.0)
  const [angle, setAngle] = useState(initial?.angle ?? 0.0)
  // panX/Y: FOV box offset from sky image centre (SVG coords)
  const [panX, setPanX] = useState(initial?.panX ?? 0)
  const [panY, setPanY] = useState(initial?.panY ?? 0)
  // viewPanX/Y: viewport pan offset (SVG coords) — not saved to store
  const [viewPanX, setViewPanX] = useState(0)
  const [viewPanY, setViewPanY] = useState(0)
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [isDragging, setIsDragging] = useState(false)

  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    if (open) {
      setScale(initial?.scale ?? 1.0)
      setAngle(initial?.angle ?? 0.0)
      setPanX(initial?.panX ?? 0)
      setPanY(initial?.panY ?? 0)
      setViewPanX(0)
      setViewPanY(0)
      setImgStatus('loading')
      setZoom(initial?.zoom ?? DEFAULT_ZOOM)
    }
  }, [open, targetId]) // eslint-disable-line react-hooks/exhaustive-deps

  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? -0.15 : 0.15
    setZoom((z) => clampZoom(z + factor * z))
  }, [])

  const boxW = BASE_W * scale
  const boxH = BASE_H * scale
  const hw = boxW / 2
  const hh = boxH / 2

  const vbSize = SVG_SIZE / zoom
  const vbCenterOffset = (SVG_SIZE - vbSize) / 2
  const viewBox = `${vbCenterOffset + viewPanX} ${vbCenterOffset + viewPanY} ${vbSize} ${vbSize}`

  const sw = 1.5 / zoom
  const crosshairSw = 1.5 / zoom
  const crosshairLen = 10 / zoom

  const startDrag = useCallback(
    (mode: DragMode, e: React.MouseEvent, currentPanX: number, currentPanY: number) => {
      const svgEl = (e.currentTarget as Element).closest('svg') as SVGSVGElement
      const rect = svgEl?.getBoundingClientRect()
      dragRef.current = {
        mode,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: currentPanX,
        startPanY: currentPanY,
        vbSize,
        svgWidth: rect?.width ?? SVG_SIZE,
      }
      setIsDragging(true)
    },
    [vbSize]
  )

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      startDrag('view', e, viewPanX, viewPanY)
    },
    [startDrag, viewPanX, viewPanY]
  )

  const handleFovMouseDown = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      e.stopPropagation()
      startDrag('fov', e, panX, panY)
    },
    [startDrag, panX, panY]
  )

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    const { mode, startClientX, startClientY, startPanX, startPanY, vbSize: dVbSize, svgWidth } = dragRef.current
    const svgScale = dVbSize / svgWidth
    const dx = (e.clientX - startClientX) * svgScale
    const dy = (e.clientY - startClientY) * svgScale
    if (mode === 'view') {
      // Dragging background pans the view (invert direction)
      setViewPanX(startPanX - dx)
      setViewPanY(startPanY - dy)
    } else {
      // Dragging FOV box repositions it
      setPanX(startPanX + dx)
      setPanY(startPanY + dy)
    }
  }, [])

  const handleSvgMouseUp = useCallback(() => {
    dragRef.current = null
    setIsDragging(false)
  }, [])

  const resetView = () => {
    setZoom(DEFAULT_ZOOM)
    setViewPanX(0)
    setViewPanY(0)
  }

  const handleApply = () => {
    updateTarget(targetId, {
      mosaic: isTrivial(scale, angle, panX, panY, zoom)
        ? null
        : { scale, angle, starMapAngle: 0.0, panX, panY, zoom },
    })
    onClose()
  }

  const handleCancel = () => {
    setScale(initial?.scale ?? 1.0)
    setAngle(initial?.angle ?? 0.0)
    setPanX(initial?.panX ?? 0)
    setPanY(initial?.panY ?? 0)
    onClose()
  }

  const isPanned = panX !== 0 || panY !== 0
  const fieldDeg = (IMG_DEG / zoom).toFixed(1)

  const url = skyViewUrl(raDec[0], raDec[1])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-3 border-b shrink-0">
          <DialogTitle>Mosaic Framing — {targetName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Sky image panel */}
          <div className="flex-1 relative bg-slate-950 min-w-0 flex items-center justify-center">
            <svg
              viewBox={viewBox}
              className="w-full h-full"
              preserveAspectRatio="xMidYMid slice"
              onWheel={handleWheel}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseLeave={handleSvgMouseUp}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              {/* DSS2 color sky image */}
              <image
                href={url}
                x={0}
                y={0}
                width={SVG_SIZE}
                height={SVG_SIZE}
                preserveAspectRatio="xMidYMid meet"
                onLoad={() => setImgStatus('loaded')}
                onError={() => setImgStatus('error')}
                style={{ filter: 'brightness(0.9) contrast(1.05)' }}
              />

              {/* Error fallback */}
              {imgStatus === 'error' && (
                <>
                  <rect width={SVG_SIZE} height={SVG_SIZE} fill="#0f172a" />
                  <text
                    x={CX} y={CY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#64748b"
                    fontSize={14 / zoom}
                  >
                    Sky image unavailable
                  </text>
                </>
              )}

              {/* Crosshair — tracks the FOV box centre (telescope pointing position) */}
              <line x1={CX + panX - crosshairLen} y1={CY + panY} x2={CX + panX + crosshairLen} y2={CY + panY}
                stroke="#f59e0b" strokeWidth={crosshairSw} />
              <line x1={CX + panX} y1={CY + panY - crosshairLen} x2={CX + panX} y2={CY + panY + crosshairLen}
                stroke="#f59e0b" strokeWidth={crosshairSw} />

              {/* FOV bounding box — draggable, separate from view pan */}
              <g
                transform={`translate(${CX + panX},${CY + panY}) rotate(${angle})`}
                onMouseDown={handleFovMouseDown}
                style={{ cursor: isDragging ? 'grabbing' : 'move' }}
              >
                <rect
                  x={-hw} y={-hh}
                  width={boxW} height={boxH}
                  fill="rgba(99,102,241,0.10)"
                  stroke="#818cf8"
                  strokeWidth={sw}
                  strokeDasharray={`${6 / zoom} ${3 / zoom}`}
                />
                <CornerMarks hw={hw} hh={hh} sw={sw} />
              </g>
            </svg>

            {/* Loading spinner */}
            {imgStatus === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            )}

            {/* Zoom / view controls overlay */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 rounded-lg px-2 py-1">
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setZoom((z) => clampZoom(z / 1.4))}
                disabled={zoom <= MIN_ZOOM}
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs text-white tabular-nums w-12 text-center">
                {fieldDeg}°
              </span>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setZoom((z) => clampZoom(z * 1.4))}
                disabled={zoom >= MAX_ZOOM}
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20"
                onClick={resetView}
                title="Reset view"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Controls sidebar */}
          <div className="w-72 shrink-0 border-l flex flex-col gap-8 p-6 overflow-y-auto">
            {/* Scale */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Scale</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums w-14 text-right">
                    {scale.toFixed(2)}×
                  </span>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => setScale(1.0)}
                    title="Reset scale"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Slider
                min={100} max={300} step={5}
                value={[Math.round(scale * 100)]}
                onValueChange={([v]) => setScale(v / 100)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1.00×</span>
                <span>2.00×</span>
                <span>3.00×</span>
              </div>
            </div>

            {/* Rotation */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Rotation</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums w-14 text-right">
                    {angle > 0 ? '+' : ''}{angle}°
                  </span>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => setAngle(0)}
                    title="Reset rotation"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Slider
                min={-90} max={90} step={1}
                value={[angle]}
                onValueChange={([v]) => setAngle(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>−90°</span>
                <span>0°</span>
                <span>+90°</span>
              </div>
            </div>

            {/* Framing */}
            <div className="space-y-2">
              <Label>Framing</Label>
              <Button
                variant="outline" size="sm" className="w-full gap-2"
                onClick={() => { setPanX(0); setPanY(0) }}
                disabled={!isPanned}
              >
                <Crosshair className="h-3.5 w-3.5" />
                Reset to center
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Drag the FOV box to reframe · drag sky to pan view
              </p>
            </div>

            {/* Info */}
            <div className="text-xs text-muted-foreground space-y-1 rounded border p-3 bg-muted/30 mt-auto">
              <p className="font-medium text-foreground">Field of View</p>
              <p>1.00× — single Seestar frame (~89′ × 56′)</p>
              <p>2.00× — 2× wider coverage</p>
              <p>3.00× — 3× wider coverage</p>
              <p className="pt-2 border-t mt-2">DSS2 Color · CDS/Aladin · 12° field</p>
              <p className="text-[10px] opacity-70">Scroll or buttons to zoom</p>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
