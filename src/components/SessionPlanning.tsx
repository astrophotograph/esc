import { useState, useEffect, useCallback } from 'react'
import { Calendar, MapPin, Star, Clock, Plus, Play, Square, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { useSession, useTelescope } from '../hooks'
import { useUIStore } from '../stores/uiStore'
import { useSchedulerStore } from '../stores/schedulerStore'
import type { TonightTarget } from '../stores'

interface SessionPlanningProps {
  compact?: boolean
}

export function SessionPlanning({ compact = false }: SessionPlanningProps) {
  const {
    sessions,
    currentSession,
    tonightTargets,
    location,
    isLoadingTargets,
    createSession,
    getSessions,
    endSession,
    removeSession,
    setCurrentSession,
    getTonightTargets,
    setObserverLocation,
    getLocationFromBrowser,
  } = useSession()

  const { currentTelescopeId, gotoTarget } = useTelescope()
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const addScheduleTarget = useSchedulerStore((s) => s.addTarget)

  const [newSessionName, setNewSessionName] = useState('')
  const [newSessionNotes, setNewSessionNotes] = useState('')
  const [showNewSession, setShowNewSession] = useState(false)
  const [locationInput, setLocationInput] = useState({
    latitude: location?.latitude?.toString() || '',
    longitude: location?.longitude?.toString() || '',
    name: location?.name || '',
  })

  // Load sessions on mount
  useEffect(() => {
    getSessions()
  }, [getSessions])

  // Load tonight's targets when location is set
  useEffect(() => {
    if (location) {
      getTonightTargets()
    }
  }, [location, getTonightTargets])

  const handleCreateSession = useCallback(async () => {
    if (!newSessionName.trim()) return

    try {
      await createSession(newSessionName, {
        telescopeId: currentTelescopeId || undefined,
        notes: newSessionNotes || undefined,
      })
      setNewSessionName('')
      setNewSessionNotes('')
      setShowNewSession(false)
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }, [newSessionName, newSessionNotes, currentTelescopeId, createSession])

  const handleEndSession = useCallback(async (sessionId: string) => {
    try {
      await endSession(sessionId)
    } catch (error) {
      console.error('Failed to end session:', error)
    }
  }, [endSession])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!confirm('Delete this session?')) return

    try {
      await removeSession(sessionId)
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }, [removeSession])

  const handleSetLocation = useCallback(() => {
    const lat = parseFloat(locationInput.latitude)
    const lon = parseFloat(locationInput.longitude)

    if (!isNaN(lat) && !isNaN(lon)) {
      setObserverLocation(lat, lon, 0, locationInput.name)
    }
  }, [locationInput, setObserverLocation])

  const handleGetCurrentLocation = useCallback(async () => {
    try {
      const pos = await getLocationFromBrowser()
      setLocationInput({
        latitude: pos.latitude.toString(),
        longitude: pos.longitude.toString(),
        name: 'Current Location',
      })
    } catch (error) {
      console.error('Failed to get location:', error)
    }
  }, [getLocationFromBrowser])

  const handleAddToSchedule = useCallback((target: TonightTarget) => {
    if (target.ra == null || target.dec == null) return
    addScheduleTarget({
      targetName: target.name,
      aliasName: target.name,
      raDec: [target.ra, target.dec],
      startMin: 0,
      durationMin: 60,
      lpFilter: false,
      mosaic: null,
    })
    setActiveTab('schedule')
  }, [addScheduleTarget, setActiveTab])

  const handleGotoTarget = useCallback(async (target: TonightTarget) => {
    if (!currentTelescopeId) return

    console.log('GOTO target:', target)
  }, [currentTelescopeId, gotoTarget])

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  const formatDuration = (start: string, end?: string) => {
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : new Date()
    const diffMs = endDate.getTime() - startDate.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="space-y-4">
      {/* Location Card */}
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Observer Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          {location ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{location.name || 'Custom Location'}</p>
                <p className="text-sm text-muted-foreground">
                  {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">Change</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Set Location</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={locationInput.name}
                        onChange={(e) => setLocationInput(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Observatory name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Latitude</Label>
                        <Input
                          type="number"
                          value={locationInput.latitude}
                          onChange={(e) => setLocationInput(prev => ({ ...prev, latitude: e.target.value }))}
                          placeholder="-90 to 90"
                        />
                      </div>
                      <div>
                        <Label>Longitude</Label>
                        <Input
                          type="number"
                          value={locationInput.longitude}
                          onChange={(e) => setLocationInput(prev => ({ ...prev, longitude: e.target.value }))}
                          placeholder="-180 to 180"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleGetCurrentLocation}>
                        Use Current Location
                      </Button>
                      <Button onClick={handleSetLocation}>
                        Set Location
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Set your location to see tonight's targets and visibility info.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Latitude</Label>
                  <Input
                    type="number"
                    value={locationInput.latitude}
                    onChange={(e) => setLocationInput(prev => ({ ...prev, latitude: e.target.value }))}
                    placeholder="-90 to 90"
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Longitude</Label>
                  <Input
                    type="number"
                    value={locationInput.longitude}
                    onChange={(e) => setLocationInput(prev => ({ ...prev, longitude: e.target.value }))}
                    placeholder="-180 to 180"
                    className="h-8"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleGetCurrentLocation}>
                  <MapPin className="h-3 w-3 mr-1" />
                  Detect
                </Button>
                <Button size="sm" onClick={handleSetLocation}>
                  Set
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tonight's Targets */}
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4" />
              Tonight's Targets
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => getTonightTargets()}
              disabled={!location || isLoadingTargets}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!location ? (
            <p className="text-sm text-muted-foreground">Set your location first</p>
          ) : isLoadingTargets ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              Loading targets...
            </div>
          ) : tonightTargets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No targets above horizon</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-auto">
              {tonightTargets.map((target) => (
                <div
                  key={target.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-sm">{target.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {target.objectType}
                      {target.constellation && ` • ${target.constellation}`}
                      {target.magnitude != null && ` • Mag ${target.magnitude.toFixed(1)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {target.altitude.toFixed(0)}° alt
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddToSchedule(target)}
                      disabled={target.ra == null}
                    >
                      Schedule
                    </Button>
                    {currentTelescopeId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleGotoTarget(target)}
                      >
                        GOTO
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Observation Sessions
            </CardTitle>
            <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-3 w-3 mr-1" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Observation Session</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Session Name</Label>
                    <Input
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      placeholder="e.g., Orion Nebula imaging"
                    />
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Input
                      value={newSessionNotes}
                      onChange={(e) => setNewSessionNotes(e.target.value)}
                      placeholder="Any notes for this session"
                    />
                  </div>
                  <Button onClick={handleCreateSession} disabled={!newSessionName.trim()}>
                    Start Session
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-auto">
              {sessions.map((session) => {
                const isActive = !session.endedAt
                const isCurrent = currentSession?.id === session.id

                return (
                  <div
                    key={session.id}
                    className={`p-3 rounded-lg border ${isCurrent ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{session.name}</p>
                          {isActive && (
                            <Badge variant="default" className="text-xs">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {formatDateTime(session.startedAt)}
                          {' • '}
                          {formatDuration(session.startedAt, session.endedAt)}
                        </p>
                        {session.notes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {session.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {isActive ? (
                          <>
                            {!isCurrent && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setCurrentSession(session)}
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEndSession(session.id)}
                            >
                              <Square className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteSession(session.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
