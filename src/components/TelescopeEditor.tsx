import { useState, useCallback } from 'react'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Edit2,
  Check,
  X,
  FolderPlus,
  ChevronRight,
} from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible'
import {
  useTelescopeStore,
  type TelescopeInfo,
  type TelescopeProtocol,
  type TelescopeSection,
} from '../stores/telescopeStore'

interface AddTelescopeFormData {
  protocol: TelescopeProtocol
  host: string
  port: string
  friendlyName: string
}

const DEFAULT_PORTS: Record<TelescopeProtocol, number> = {
  seestar: 4700,
  alpaca: 11111,
}

export function TelescopeEditor() {
  const {
    telescopes,
    sections,
    addTelescope,
    removeTelescope,
    updateTelescope,
    reorderTelescope,
    swapTelescopeOrder,
    addSection,
    removeSection,
    updateSection,
    toggleSectionCollapse,
    getTelescopesBySection,
  } = useTelescopeStore()

  const [showAddForm, setShowAddForm] = useState(false)
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'telescope' | 'section'; id: string; name: string } | null>(null)
  const [formData, setFormData] = useState<AddTelescopeFormData>({
    protocol: 'seestar',
    host: '',
    port: '4700',
    friendlyName: '',
  })

  const handleProtocolChange = (protocol: TelescopeProtocol) => {
    setFormData(prev => ({
      ...prev,
      protocol,
      port: String(DEFAULT_PORTS[protocol]),
    }))
  }

  const handleAddTelescope = useCallback(() => {
    if (!formData.host.trim()) return

    const port = parseInt(formData.port) || DEFAULT_PORTS[formData.protocol]
    const id = `manual-${formData.host}:${port}-${Date.now()}`

    addTelescope({
      id,
      host: formData.host.trim(),
      port,
      protocol: formData.protocol,
      friendlyName: formData.friendlyName.trim() || undefined,
      name: formData.friendlyName.trim() || `${formData.protocol} @ ${formData.host}`,
      discovery_method: 'manual',
      status: 'disconnected',
    })

    // Reset form
    setFormData({
      protocol: 'seestar',
      host: '',
      port: '4700',
      friendlyName: '',
    })
    setShowAddForm(false)
  }, [formData, addTelescope])

  const handleAddSection = useCallback(() => {
    if (!newSectionName.trim()) return
    addSection(newSectionName.trim())
    setNewSectionName('')
    setShowAddSection(false)
  }, [newSectionName, addSection])

  const startEditing = (telescope: TelescopeInfo) => {
    setEditingId(telescope.id)
    setEditingName(telescope.friendlyName || telescope.name || '')
  }

  const saveEdit = () => {
    if (editingId) {
      updateTelescope(editingId, { friendlyName: editingName.trim() || undefined })
      setEditingId(null)
      setEditingName('')
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const startEditingSection = (section: TelescopeSection) => {
    setEditingSectionId(section.id)
    setEditingSectionName(section.name)
  }

  const saveEditSection = () => {
    if (editingSectionId) {
      updateSection(editingSectionId, { name: editingSectionName.trim() })
      setEditingSectionId(null)
      setEditingSectionName('')
    }
  }

  const cancelEditSection = () => {
    setEditingSectionId(null)
    setEditingSectionName('')
  }

  const moveTelescope = (telescopeId: string, direction: 'up' | 'down') => {
    const telescope = telescopes.find(t => t.id === telescopeId)
    if (!telescope) return

    // Get telescopes in same section, sorted consistently
    const sameSectionTelescopes = telescopes
      .filter(t => t.sectionId === telescope.sectionId)
      .sort((a, b) => {
        // Sort by sortOrder if defined, otherwise by id for stable ordering
        const orderA = a.sortOrder ?? Infinity
        const orderB = b.sortOrder ?? Infinity
        if (orderA !== orderB) return orderA - orderB
        return a.id.localeCompare(b.id)
      })

    const currentIndex = sameSectionTelescopes.findIndex(t => t.id === telescopeId)
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (targetIndex < 0 || targetIndex >= sameSectionTelescopes.length) return

    const targetTelescope = sameSectionTelescopes[targetIndex]

    // Swap positions atomically - assign target's position to current, and vice versa
    swapTelescopeOrder(telescopeId, targetIndex, targetTelescope.id, currentIndex)
  }

  const moveToSection = (telescopeId: string, sectionId: string | null) => {
    const targetSectionTelescopes = telescopes.filter(t => t.sectionId === sectionId)
    const maxOrder = Math.max(0, ...targetSectionTelescopes.map(t => t.sortOrder ?? 0))
    reorderTelescope(telescopeId, sectionId, maxOrder + 1)
  }

  const getDisplayName = (telescope: TelescopeInfo) => {
    return telescope.friendlyName || telescope.name || `${telescope.host}:${telescope.port}`
  }

  const telescopesBySection = getTelescopesBySection()

  return (
    <div className="space-y-4">
      {/* Add Telescope Button */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex-1"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Telescope
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddSection(!showAddSection)}
        >
          <FolderPlus className="h-4 w-4 mr-2" />
          Add Section
        </Button>
      </div>

      {/* Add Section Form */}
      {showAddSection && (
        <div className="p-3 border rounded-lg bg-muted/50 space-y-3">
          <Label htmlFor="section-name">Section Name</Label>
          <div className="flex gap-2">
            <Input
              id="section-name"
              placeholder="e.g., Backyard Scopes"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
            />
            <Button size="sm" onClick={handleAddSection} disabled={!newSectionName.trim()}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddSection(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Telescope Form */}
      {showAddForm && (
        <div className="p-3 border rounded-lg bg-muted/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="protocol">Protocol</Label>
              <Select
                value={formData.protocol}
                onValueChange={(v) => handleProtocolChange(v as TelescopeProtocol)}
              >
                <SelectTrigger id="protocol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seestar">Seestar</SelectItem>
                  <SelectItem value="alpaca">ASCOM Alpaca</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                placeholder={String(DEFAULT_PORTS[formData.protocol])}
                value={formData.port}
                onChange={(e) => setFormData(prev => ({ ...prev, port: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="host">IP Address / Hostname</Label>
            <Input
              id="host"
              placeholder="192.168.1.100"
              value={formData.host}
              onChange={(e) => setFormData(prev => ({ ...prev, host: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="friendly-name">Friendly Name (optional)</Label>
            <Input
              id="friendly-name"
              placeholder="My Seestar"
              value={formData.friendlyName}
              onChange={(e) => setFormData(prev => ({ ...prev, friendlyName: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddTelescope} disabled={!formData.host.trim()}>
              Add Telescope
            </Button>
          </div>
        </div>
      )}

      {/* Telescope List */}
      <div className="space-y-2">
        {telescopesBySection.map(({ section, telescopes: sectionTelescopes }) => (
          <div key={section?.id ?? 'unsectioned'}>
            {section ? (
              <Collapsible open={!section.collapsed}>
                <div className="flex items-center gap-2 py-1">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => toggleSectionCollapse(section.id)}
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${!section.collapsed ? 'rotate-90' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>

                  {editingSectionId === section.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditSection()
                          if (e.key === 'Escape') cancelEditSection()
                        }}
                        className="h-6 text-sm"
                        autoFocus
                      />
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={saveEditSection}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={cancelEditSection}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium flex-1">{section.name}</span>
                      <span className="text-xs text-muted-foreground">{sectionTelescopes.length}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                        onClick={() => startEditingSection(section)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-50 hover:opacity-100 text-destructive"
                        onClick={() => setDeleteTarget({ type: 'section', id: section.id, name: section.name })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>

                <CollapsibleContent>
                  <div className="ml-6 space-y-1">
                    {sectionTelescopes.map((telescope, index) => (
                      <TelescopeRow
                        key={telescope.id}
                        telescope={telescope}
                        isFirst={index === 0}
                        isLast={index === sectionTelescopes.length - 1}
                        isEditing={editingId === telescope.id}
                        editingName={editingName}
                        sections={sections}
                        onStartEdit={() => startEditing(telescope)}
                        onSaveEdit={saveEdit}
                        onCancelEdit={cancelEdit}
                        onEditNameChange={setEditingName}
                        onMove={(dir) => moveTelescope(telescope.id, dir)}
                        onMoveToSection={(sectionId) => moveToSection(telescope.id, sectionId)}
                        onDelete={() => setDeleteTarget({ type: 'telescope', id: telescope.id, name: getDisplayName(telescope) })}
                        getDisplayName={getDisplayName}
                      />
                    ))}
                    {sectionTelescopes.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 italic">No telescopes in this section</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              // Unsectioned telescopes
              <div className="space-y-1">
                {sectionTelescopes.map((telescope, index) => (
                  <TelescopeRow
                    key={telescope.id}
                    telescope={telescope}
                    isFirst={index === 0}
                    isLast={index === sectionTelescopes.length - 1}
                    isEditing={editingId === telescope.id}
                    editingName={editingName}
                    sections={sections}
                    onStartEdit={() => startEditing(telescope)}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onEditNameChange={setEditingName}
                    onMove={(dir) => moveTelescope(telescope.id, dir)}
                    onMoveToSection={(sectionId) => moveToSection(telescope.id, sectionId)}
                    onDelete={() => setDeleteTarget({ type: 'telescope', id: telescope.id, name: getDisplayName(telescope) })}
                    getDisplayName={getDisplayName}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {telescopes.length === 0 && !showAddForm && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No telescopes configured. Add one manually or wait for auto-discovery.
          </p>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === 'section' ? 'Section' : 'Telescope'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'section'
                ? `This will remove the section "${deleteTarget.name}". Telescopes in this section will be moved to the main list.`
                : `This will remove "${deleteTarget?.name}" from your telescope list. You can add it back later.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget?.type === 'section') {
                  removeSection(deleteTarget.id)
                } else if (deleteTarget) {
                  removeTelescope(deleteTarget.id)
                }
                setDeleteTarget(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Sub-component for telescope row
interface TelescopeRowProps {
  telescope: TelescopeInfo
  isFirst: boolean
  isLast: boolean
  isEditing: boolean
  editingName: string
  sections: TelescopeSection[]
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditNameChange: (name: string) => void
  onMove: (direction: 'up' | 'down') => void
  onMoveToSection: (sectionId: string | null) => void
  onDelete: () => void
  getDisplayName: (t: TelescopeInfo) => string
}

function TelescopeRow({
  telescope,
  isFirst,
  isLast,
  isEditing,
  editingName,
  sections,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onMove,
  onMoveToSection,
  onDelete,
  getDisplayName,
}: TelescopeRowProps) {
  const statusColor = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    error: 'bg-red-500',
    disconnected: 'bg-gray-400',
  }[telescope.status]

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-card border hover:bg-accent/50 group">
      <div className={`w-2 h-2 rounded-full ${statusColor} flex-shrink-0`} />

      {isEditing ? (
        <div className="flex items-center gap-1 flex-1">
          <Input
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit()
              if (e.key === 'Escape') onCancelEdit()
            }}
            className="h-7 text-sm"
            autoFocus
          />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onSaveEdit}>
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCancelEdit}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{getDisplayName(telescope)}</div>
            <div className="text-xs text-muted-foreground">
              {telescope.protocol || 'seestar'} @ {telescope.host}:{telescope.port}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Move up/down */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={isFirst}
              onClick={() => onMove('up')}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={isLast}
              onClick={() => onMove('down')}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>

            {/* Move to section */}
            {sections.length > 0 && (
              <Select
                value={telescope.sectionId || '__none__'}
                onValueChange={(v) => onMoveToSection(v === '__none__' ? null : v)}
              >
                <SelectTrigger className="h-6 w-24 text-xs">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No section</SelectItem>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Edit */}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onStartEdit}>
              <Edit2 className="h-3 w-3" />
            </Button>

            {/* Delete */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
