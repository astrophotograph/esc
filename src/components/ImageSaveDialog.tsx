import { useState, useCallback } from 'react'
import { Save, Loader2, Check, Image as ImageIcon } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { invoke } from '../services/api'
import { useTelescopeStore, useImagingStore } from '../stores'

interface ImageSaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (path: string) => void
}

const IMAGE_FORMATS = [
  { value: 'png', label: 'PNG', extension: '.png', description: 'Lossless, best quality' },
  { value: 'jpg', label: 'JPEG', extension: '.jpg', description: 'Smaller file size' },
  { value: 'fits', label: 'FITS', extension: '.fits', description: 'Scientific format' },
]

export function ImageSaveDialog({ open, onOpenChange, onSaved }: ImageSaveDialogProps) {
  const { currentTelescopeId, telescopes, addActivity } = useTelescopeStore()
  const { sessions } = useImagingStore()

  const [filename, setFilename] = useState('')
  const [format, setFormat] = useState('png')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedPath, setSavedPath] = useState('')

  const currentTelescope = telescopes.find(t => t.id === currentTelescopeId)
  const isConnected = currentTelescope?.status === 'connected'
  const currentSession = currentTelescopeId ? sessions[currentTelescopeId] : null

  // Generate default filename
  const generateFilename = useCallback(() => {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const target = currentSession?.targetName || 'capture'
    const sanitizedTarget = target.replace(/[^a-zA-Z0-9]/g, '_')
    return `${sanitizedTarget}_${timestamp}`
  }, [currentSession?.targetName])

  // Reset state when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setFilename(generateFilename())
      setSaved(false)
      setSavedPath('')
    }
    onOpenChange(isOpen)
  }

  const handleSave = async () => {
    if (!currentTelescopeId || !filename) return

    setIsSaving(true)
    try {
      const ext = IMAGE_FORMATS.find(f => f.value === format)?.extension || '.png'
      const fullPath = `${filename}${ext}`

      const result = await invoke<{ success: boolean; path?: string; error?: string }>('telescope_save_image', {
        telescopeId: currentTelescopeId,
        filePath: fullPath,
        format,
      })

      if (result.success) {
        setSaved(true)
        setSavedPath(result.path || fullPath)
        addActivity(currentTelescopeId, 'success', `Image saved to ${result.path || fullPath}`)
        onSaved?.(result.path || fullPath)

        // Close after a brief delay
        setTimeout(() => {
          onOpenChange(false)
        }, 1500)
      } else {
        throw new Error(result.error || 'Failed to save image')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save image'
      addActivity(currentTelescopeId, 'error', message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Save Image
          </DialogTitle>
          <DialogDescription>
            Save the current camera frame to your computer
          </DialogDescription>
        </DialogHeader>

        {!isConnected ? (
          <div className="py-8 text-center text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Connect to a telescope to save images</p>
          </div>
        ) : saved ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <p className="font-medium">Image Saved!</p>
            <p className="text-sm text-muted-foreground mt-1 break-all">
              {savedPath}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Filename */}
            <div className="space-y-2">
              <Label htmlFor="filename">Filename</Label>
              <Input
                id="filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="Enter filename..."
              />
              <p className="text-xs text-muted-foreground">
                File will be saved to the current working directory
              </p>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_FORMATS.map(fmt => (
                    <SelectItem key={fmt.value} value={fmt.value}>
                      <div className="flex items-center justify-between gap-4">
                        <span>{fmt.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {fmt.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Session Info */}
            {currentSession && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
                <p>
                  <strong>Target:</strong> {currentSession.targetName || 'Unknown'}
                </p>
                <p>
                  <strong>Exposure:</strong> {currentSession.exposure}ms
                </p>
                <p>
                  <strong>Gain:</strong> {currentSession.gain}
                </p>
                {currentSession.frameCount > 0 && (
                  <p>
                    <strong>Stacked frames:</strong> {currentSession.frameCount}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {saved ? 'Close' : 'Cancel'}
          </Button>
          {!saved && (
            <Button onClick={handleSave} disabled={isSaving || !filename || !isConnected}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
