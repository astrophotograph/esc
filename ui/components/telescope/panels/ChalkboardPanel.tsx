"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Pen,
  Circle,
  MoveRight,
  Trash2,
  EyeOff,
  RotateCcw
} from "lucide-react"

interface DrawingPoint {
  x: number
  y: number
}

interface DrawingPath {
  type: 'draw' | 'circle' | 'arrow'
  points: DrawingPoint[]
  color: string
  id: string
}

interface ChalkboardPanelProps {
  visible: boolean
  onToggle: () => void
  containerWidth: number
  containerHeight: number
  zoom: number
  rotation: number
  offsetX: number
  offsetY: number
}

const COLORS = [
  '#ff0000', // Red
  '#00ff00', // Green
  '#0000ff', // Blue
  '#ffffff', // White
  '#ffff00', // Yellow
  '#ff00ff', // Magenta
  '#00ffff', // Cyan
  '#ffa500', // Orange
]

const STORAGE_KEY = 'telescope-chalkboard-drawings'

export function ChalkboardPanel({
  visible,
  onToggle,
  containerWidth,
  containerHeight,
  zoom,
  rotation,
  offsetX,
  offsetY
}: ChalkboardPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectedTool, setSelectedTool] = useState<'draw' | 'circle' | 'arrow'>('draw')
  const [selectedColor, setSelectedColor] = useState('#ff0000')
  const [currentPath, setCurrentPath] = useState<DrawingPoint[]>([])
  const [drawings, setDrawings] = useState<DrawingPath[]>([])
  const [startPoint, setStartPoint] = useState<DrawingPoint | null>(null)
  
  // Animated transform values for smooth transitions
  const [animatedZoom, setAnimatedZoom] = useState(zoom)
  const [animatedOffsetX, setAnimatedOffsetX] = useState(offsetX)
  const [animatedOffsetY, setAnimatedOffsetY] = useState(offsetY)
  const [animatedRotation, setAnimatedRotation] = useState(rotation)

  // Load drawings from localStorage on mount
  useEffect(() => {
    const savedDrawings = localStorage.getItem(STORAGE_KEY)
    if (savedDrawings) {
      try {
        setDrawings(JSON.parse(savedDrawings))
      } catch (error) {
        console.error('Failed to load drawings from localStorage:', error)
      }
    }
  }, [])

  // Save drawings to localStorage whenever drawings change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drawings))
  }, [drawings])

  // Animate transform values for smooth transitions
  useEffect(() => {
    const animateValue = (
      current: number, 
      target: number, 
      setter: (value: number) => void,
      duration = 200
    ) => {
      const startTime = Date.now()
      const startValue = current
      const deltaValue = target - startValue
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Eased transition (ease-in-out)
        const eased = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2
          
        const newValue = startValue + deltaValue * eased
        setter(newValue)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }
      
      requestAnimationFrame(animate)
    }

    animateValue(animatedZoom, zoom, setAnimatedZoom)
    animateValue(animatedOffsetX, offsetX, setAnimatedOffsetX)  
    animateValue(animatedOffsetY, offsetY, setAnimatedOffsetY)
    animateValue(animatedRotation, rotation, setAnimatedRotation)
  }, [zoom, offsetX, offsetY, rotation, animatedZoom, animatedOffsetX, animatedOffsetY, animatedRotation])

  // Convert screen coordinates to image-relative coordinates that are invariant to transformations
  const screenToImageCoords = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    
    // Get relative position within canvas
    const relativeX = clientX - rect.left
    const relativeY = clientY - rect.top
    
    // Convert to center-based coordinates
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    let x = relativeX - centerX
    let y = relativeY - centerY
    
    // Reverse the current transformations to get image-space coordinates
    
    // 1. Reverse rotation
    const cos = Math.cos(-rotation)
    const sin = Math.sin(-rotation)
    let rotatedX = x * cos - y * sin
    let rotatedY = x * sin + y * cos
    
    // 2. Reverse pan
    rotatedX = rotatedX - offsetX
    rotatedY = rotatedY - offsetY
    
    // 3. Reverse zoom  
    rotatedX = rotatedX / zoom
    rotatedY = rotatedY / zoom
    
    // Convert back to canvas coordinates (but these are now in "image space")
    return {
      x: rotatedX + canvas.width / 2,
      y: rotatedY + canvas.height / 2
    }
  }, [rotation, zoom, offsetX, offsetY])

  // Apply image transformations to a point using animated values
  const transformPoint = useCallback((x: number, y: number) => {
    if (!canvasRef.current) return { x, y }
    
    const canvas = canvasRef.current
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    
    // Convert to center-based coordinates
    let px = x - centerX
    let py = y - centerY
    
    // Apply animated zoom
    px = px * animatedZoom
    py = py * animatedZoom
    
    // Apply animated pan
    px = px + animatedOffsetX
    py = py + animatedOffsetY
    
    // Apply animated rotation
    const cos = Math.cos(animatedRotation)
    const sin = Math.sin(animatedRotation)
    const rotatedX = px * cos - py * sin
    const rotatedY = px * sin + py * cos
    
    // Convert back to canvas coordinates
    return {
      x: rotatedX + centerX,
      y: rotatedY + centerY
    }
  }, [animatedZoom, animatedOffsetX, animatedOffsetY, animatedRotation])

  // Redraw all paths on canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Draw all saved paths
    drawings.forEach(drawing => {
      ctx.strokeStyle = drawing.color
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      
      if (drawing.type === 'draw') {
        // Draw freehand path
        if (drawing.points.length > 1) {
          ctx.beginPath()
          const startTransformed = transformPoint(drawing.points[0].x, drawing.points[0].y)
          ctx.moveTo(startTransformed.x, startTransformed.y)
          
          for (let i = 1; i < drawing.points.length; i++) {
            const pointTransformed = transformPoint(drawing.points[i].x, drawing.points[i].y)
            ctx.lineTo(pointTransformed.x, pointTransformed.y)
          }
          ctx.stroke()
        }
      } else if (drawing.type === 'circle') {
        // Draw circle
        if (drawing.points.length >= 2) {
          const centerTransformed = transformPoint(drawing.points[0].x, drawing.points[0].y)
          const edgeTransformed = transformPoint(drawing.points[1].x, drawing.points[1].y)
          const radius = Math.sqrt(
            Math.pow(edgeTransformed.x - centerTransformed.x, 2) + 
            Math.pow(edgeTransformed.y - centerTransformed.y, 2)
          )
          
          ctx.beginPath()
          ctx.arc(centerTransformed.x, centerTransformed.y, radius, 0, 2 * Math.PI)
          ctx.stroke()
        }
      } else if (drawing.type === 'arrow') {
        // Draw arrow
        if (drawing.points.length >= 2) {
          const startTransformed = transformPoint(drawing.points[0].x, drawing.points[0].y)
          const endTransformed = transformPoint(drawing.points[1].x, drawing.points[1].y)
          
          // Draw arrow line
          ctx.beginPath()
          ctx.moveTo(startTransformed.x, startTransformed.y)
          ctx.lineTo(endTransformed.x, endTransformed.y)
          ctx.stroke()
          
          // Draw arrow head
          const angle = Math.atan2(endTransformed.y - startTransformed.y, endTransformed.x - startTransformed.x)
          const arrowLength = 15
          const arrowAngle = Math.PI / 6
          
          ctx.beginPath()
          ctx.moveTo(endTransformed.x, endTransformed.y)
          ctx.lineTo(
            endTransformed.x - arrowLength * Math.cos(angle - arrowAngle),
            endTransformed.y - arrowLength * Math.sin(angle - arrowAngle)
          )
          ctx.moveTo(endTransformed.x, endTransformed.y)
          ctx.lineTo(
            endTransformed.x - arrowLength * Math.cos(angle + arrowAngle),
            endTransformed.y - arrowLength * Math.sin(angle + arrowAngle)
          )
          ctx.stroke()
        }
      }
    })
    
    // Draw current path being drawn
    if (isDrawing && currentPath.length > 0) {
      ctx.strokeStyle = selectedColor
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      
      if (selectedTool === 'draw') {
        if (currentPath.length > 1) {
          ctx.beginPath()
          const startTransformed = transformPoint(currentPath[0].x, currentPath[0].y)
          ctx.moveTo(startTransformed.x, startTransformed.y)
          
          for (let i = 1; i < currentPath.length; i++) {
            const pointTransformed = transformPoint(currentPath[i].x, currentPath[i].y)
            ctx.lineTo(pointTransformed.x, pointTransformed.y)
          }
          ctx.stroke()
        }
      } else if (selectedTool === 'circle' && startPoint) {
        const centerTransformed = transformPoint(startPoint.x, startPoint.y)
        const currentTransformed = transformPoint(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y)
        const radius = Math.sqrt(
          Math.pow(currentTransformed.x - centerTransformed.x, 2) + 
          Math.pow(currentTransformed.y - centerTransformed.y, 2)
        )
        
        ctx.beginPath()
        ctx.arc(centerTransformed.x, centerTransformed.y, radius, 0, 2 * Math.PI)
        ctx.stroke()
      } else if (selectedTool === 'arrow' && startPoint) {
        const startTransformed = transformPoint(startPoint.x, startPoint.y)
        const currentTransformed = transformPoint(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y)
        
        // Draw arrow line
        ctx.beginPath()
        ctx.moveTo(startTransformed.x, startTransformed.y)
        ctx.lineTo(currentTransformed.x, currentTransformed.y)
        ctx.stroke()
        
        // Draw arrow head
        const angle = Math.atan2(currentTransformed.y - startTransformed.y, currentTransformed.x - startTransformed.x)
        const arrowLength = 15
        const arrowAngle = Math.PI / 6
        
        ctx.beginPath()
        ctx.moveTo(currentTransformed.x, currentTransformed.y)
        ctx.lineTo(
          currentTransformed.x - arrowLength * Math.cos(angle - arrowAngle),
          currentTransformed.y - arrowLength * Math.sin(angle - arrowAngle)
        )
        ctx.moveTo(currentTransformed.x, currentTransformed.y)
        ctx.lineTo(
          currentTransformed.x - arrowLength * Math.cos(angle + arrowAngle),
          currentTransformed.y - arrowLength * Math.sin(angle + arrowAngle)
        )
        ctx.stroke()
      }
    }
  }, [drawings, currentPath, isDrawing, selectedColor, selectedTool, startPoint, transformPoint])

  // Redraw canvas when animated values change (creates smooth animation)
  useEffect(() => {
    redrawCanvas()
  }, [animatedZoom, animatedOffsetX, animatedOffsetY, animatedRotation, redrawCanvas])

  // Immediate redraw for drawing state changes and saved drawings
  useEffect(() => {
    redrawCanvas()
  }, [drawings, isDrawing, currentPath, selectedColor, selectedTool, startPoint, redrawCanvas])

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle if the event is directly on the canvas
    if (e.target !== canvasRef.current) {
      return
    }
    
    // Check if there's a UI element at this position by temporarily hiding canvas and checking what's underneath
    const canvas = canvasRef.current
    if (!canvas) return
    
    // Temporarily hide the canvas to see what's underneath
    const originalPointerEvents = canvas.style.pointerEvents
    canvas.style.pointerEvents = 'none'
    
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY)
    
    // Restore canvas pointer events
    canvas.style.pointerEvents = originalPointerEvents
    
    // If there's a clickable element below (button, card, etc.), don't start drawing
    if (elementBelow && (
      elementBelow.tagName === 'BUTTON' ||
      elementBelow.closest('button') ||
      elementBelow.closest('[role="button"]') ||
      elementBelow.closest('.card') ||
      elementBelow.closest('[data-clickable]')
    )) {
      return
    }
    
    e.preventDefault()
    e.stopPropagation()
    
    const point = screenToImageCoords(e.clientX, e.clientY)
    setIsDrawing(true)
    setStartPoint(point)
    setCurrentPath([point])
  }

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const point = screenToImageCoords(e.clientX, e.clientY)
    
    if (selectedTool === 'draw') {
      setCurrentPath(prev => [...prev, point])
    } else {
      // For circle and arrow, only keep start and current point
      setCurrentPath([startPoint!, point])
    }
  }

  // Handle mouse up
  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing) return
    
    e.preventDefault()
    e.stopPropagation()
    
    // Save the drawing
    const newDrawing: DrawingPath = {
      type: selectedTool,
      points: [...currentPath],
      color: selectedColor,
      id: Date.now().toString()
    }
    
    setDrawings(prev => [...prev, newDrawing])
    setIsDrawing(false)
    setCurrentPath([])
    setStartPoint(null)
  }

  // Clear all drawings
  const clearDrawings = useCallback(() => {
    setDrawings([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // Undo last drawing
  const undoLastDrawing = useCallback(() => {
    setDrawings(prev => prev.slice(0, -1))
  }, [])

  // Handle tool selection
  const handleToolSelect = useCallback((tool: 'draw' | 'circle' | 'arrow') => {
    setSelectedTool(tool)
  }, [])

  // Handle color selection
  const handleColorSelect = useCallback((color: string) => {
    setSelectedColor(color)
  }, [])

  if (!visible) return null

  return (
    <TooltipProvider>
      <div 
        className="absolute inset-0"
        style={{ 
          pointerEvents: 'none',
        }}
      >
        {/* Canvas for drawings - rotation handled in coordinate system */}
        <canvas
          ref={canvasRef}
          width={containerWidth}
          height={containerHeight}
          className="absolute inset-0 cursor-crosshair transition-all duration-200 ease-in-out"
          style={{ 
            width: containerWidth, 
            height: containerHeight,
            zIndex: 10,
            pointerEvents: 'auto',
            transformOrigin: 'center center'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDrawing) {
              handleMouseUp({} as React.MouseEvent)
            }
          }}
        />
        
        {/* Tool panel - positioned to avoid zoom controls with higher z-index */}
        <Card className="absolute top-20 right-4 bg-black/70 backdrop-blur-sm border-gray-600" style={{ zIndex: 20, pointerEvents: 'auto' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Pen className="w-4 h-4" />
              Chalkboard Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Drawing Tools */}
            <div className="flex flex-col gap-2">
              <div className="text-xs text-gray-300 mb-1">Tools</div>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={selectedTool === 'draw' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleToolSelect('draw')}
                      className="w-8 h-8 p-0"
                    >
                      <Pen className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Draw freehand</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={selectedTool === 'circle' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleToolSelect('circle')}
                      className="w-8 h-8 p-0"
                    >
                      <Circle className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Draw circle</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={selectedTool === 'arrow' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleToolSelect('arrow')}
                      className="w-8 h-8 p-0"
                    >
                      <MoveRight className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Draw arrow</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            
            {/* Color Picker */}
            <div className="flex flex-col gap-2">
              <div className="text-xs text-gray-300 mb-1">Colors</div>
              <div className="grid grid-cols-4 gap-1">
                {COLORS.map(color => (
                  <Button
                    key={color}
                    variant="outline"
                    size="sm"
                    onClick={() => handleColorSelect(color)}
                    className={`w-6 h-6 p-0 border-2 ${
                      selectedColor === color ? 'border-white' : 'border-gray-500'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex flex-col gap-2">
              <div className="text-xs text-gray-300 mb-1">Actions</div>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={undoLastDrawing}
                      disabled={drawings.length === 0}
                      className="w-8 h-8 p-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Undo last drawing</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearDrawings}
                      disabled={drawings.length === 0}
                      className="w-8 h-8 p-0 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear all drawings</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onToggle}
                      className="w-8 h-8 p-0"
                    >
                      <EyeOff className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Hide chalkboard</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}