import { useState, useEffect } from 'react'
import { invoke } from '../services/api'
import { listen } from '@tauri-apps/api/event'
import { PictureInPicture2, Save, Compass } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { useTelescopeStore } from '../stores/telescopeStore'
import { useUIStore } from '../stores/uiStore'
import { VideoFeed } from './VideoFeed'
import { StatusBar } from './StatusBar'
import { PictureInPicture } from './PictureInPicture'
import { ImagingPanel } from './ImagingPanel'
import { FocusControlPanel } from './FocusControlPanel'
import { GotoProgressOverlay } from './GotoProgressOverlay'
import { ImageSaveDialog } from './ImageSaveDialog'
import { PlateSolveDialog } from './PlateSolveDialog'

export function TelescopeControl() {
  const [host, setHost] = useState('192.168.1.100')
  const [port, setPort] = useState(4700)
  const [targetName, setTargetName] = useState('M42 - Orion Nebula')
  const [ra, setRa] = useState(5.583333)
  const [dec, setDec] = useState(-5.391111)
  const [loading, setLoading] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [showPip, setShowPip] = useState(false)
  const [showGotoOverlay, setShowGotoOverlay] = useState(false)
  const [gotoTarget, setGotoTarget] = useState<{ name: string; ra: number; dec: number } | null>(null)

  const telescopes = useTelescopeStore(state => state.telescopes)
  const currentTelescopeId = useTelescopeStore(state => state.currentTelescopeId)
  const setCurrentTelescope = useTelescopeStore(state => state.setCurrentTelescope)
  const mergeTelescopes = useTelescopeStore(state => state.mergeTelescopes)
  const addTelescope = useTelescopeStore(state => state.addTelescope)
  const updateTelescope = useTelescopeStore(state => state.updateTelescope)

  const {
    showImageSaveDialog,
    setShowImageSaveDialog,
    showPlateSolveDialog,
    setShowPlateSolveDialog,
  } = useUIStore()

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50))
  }

  // Listen for telescope events
  useEffect(() => {
    const unlistenPromises = [
      listen('telescope-discovered', (event: any) => {
        const { id, host, port, name, serial_number } = event.payload
        const telescope = {
          id,
          host,
          port,
          name: name || `Seestar ${serial_number || host}`,
          serial_number,
          status: 'disconnected' as const
        }
        // Only add if it doesn't already exist
        const exists = useTelescopeStore.getState().telescopes.find(t => t.id === id)
        if (!exists) {
          addTelescope(telescope)
          addLog(`✓ Telescope discovered: ${telescope.name}`)
        }
      }),
      listen('telescope-connected', (event: any) => {
        const { id } = event.payload
        updateTelescope(id, { status: 'connected' })
        addLog(`✓ Telescope ${id} connected`)
      }),
      listen('telescope-disconnected', (event: any) => {
        const { id } = event.payload
        updateTelescope(id, { status: 'disconnected' })
        addLog(`ℹ Telescope ${id} disconnected`)
      }),
      listen('telescope-error', (event: any) => {
        const { id, error } = event.payload
        updateTelescope(id, { status: 'error' })
        addLog(`✗ Telescope ${id} error: ${error}`)
      }),
    ]

    return () => {
      Promise.all(unlistenPromises).then(unlisteners => {
        unlisteners.forEach(unlisten => unlisten())
      })
    }
  }, [updateTelescope, addTelescope])

  const handleDiscoverTelescopes = async () => {
    setDiscovering(true)
    try {
      const result = await invoke<any[]>('discover_telescopes', {})
      addLog(`✓ Discovered ${result.length} telescope(s)`)

      // Update telescope list
      const discovered = result.map(t => ({
        id: t.serial_number || `${t.host}:${t.port}`,
        name: `Seestar ${t.serial_number}`,
        host: t.host,
        port: t.port,
        status: 'disconnected' as const
      }))
      mergeTelescopes(discovered)

      if (discovered.length > 0) {
        setCurrentTelescope(discovered[0].id)
      }
    } catch (error) {
      addLog(`✗ Discovery failed: ${error}`)
    } finally {
      setDiscovering(false)
    }
  }

  const handleAddTelescope = async () => {
    setLoading(true)
    try {
      const id = `telescope_${Date.now()}`
      await invoke('add_telescope', {
        config: { id, host, port, name: `Seestar ${host}` }
      })
      addLog(`✓ Telescope added: ${host}:${port}`)
      setCurrentTelescope(id)
    } catch (error) {
      addLog(`✗ Error adding telescope: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!currentTelescopeId) {
      addLog('⚠ Please add a telescope first')
      return
    }
    setLoading(true)
    // Update status to connecting immediately
    updateTelescope(currentTelescopeId, { status: 'connecting' })
    addLog(`⟳ Connecting to telescope...`)
    try {
      await invoke('connect_telescope', { telescopeId: currentTelescopeId })
      // Status update will come from the event listener
    } catch (error) {
      updateTelescope(currentTelescopeId, { status: 'error' })
      addLog(`✗ Connection failed: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!currentTelescopeId) return
    setLoading(true)
    addLog(`⟳ Disconnecting...`)
    try {
      await invoke('disconnect_telescope', { telescopeId: currentTelescopeId })
      // Status update will come from the event listener
    } catch (error) {
      addLog(`✗ Disconnect failed: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleGoto = async () => {
    if (!currentTelescopeId) {
      addLog('⚠ No telescope connected')
      return
    }
    setLoading(true)
    try {
      // Convert RA from hours to degrees for the overlay
      const raDeg = ra * 15
      setGotoTarget({ name: targetName, ra: raDeg, dec })
      setShowGotoOverlay(true)

      await invoke('goto_target', {
        telescopeId: currentTelescopeId,
        params: { target_name: targetName, ra, dec }
      })
      addLog(`✓ GOTO ${targetName} (RA: ${ra}h, Dec: ${dec}°)`)
    } catch (error) {
      addLog(`✗ GOTO failed: ${error}`)
      setShowGotoOverlay(false)
    } finally {
      setLoading(false)
    }
  }

  const handlePark = async () => {
    if (!currentTelescopeId) return
    setLoading(true)
    try {
      await invoke('park_telescope', { telescopeId: currentTelescopeId })
      addLog(`✓ Telescope parked`)
    } catch (error) {
      addLog(`✗ Park failed: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const currentTelescope = telescopes.find(t => t.id === currentTelescopeId)

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Real-time Status Bar */}
      <StatusBar telescopeId={currentTelescopeId || undefined} />

      {/* Status Bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Telescope Status</CardTitle>
              <CardDescription>
                {currentTelescope
                  ? `${currentTelescope.name} - ${currentTelescope.host}:${currentTelescope.port}`
                  : 'No telescope selected'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                currentTelescope?.status === 'connected' ? 'bg-green-500 text-white' :
                currentTelescope?.status === 'connecting' ? 'bg-yellow-500 text-white' :
                currentTelescope?.status === 'error' ? 'bg-red-500 text-white' :
                'bg-gray-300 text-gray-700'
              }`}>
                {(currentTelescope?.status || 'disconnected').toUpperCase()}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Control Tabs */}
      <Tabs defaultValue="connection" className="flex-1">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="goto">GOTO</TabsTrigger>
          <TabsTrigger value="imaging">Imaging</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Connection Tab */}
        <TabsContent value="connection" className="space-y-4">
          {/* Auto-Discovery */}
          <Card>
            <CardHeader>
              <CardTitle>Auto-Discovery</CardTitle>
              <CardDescription>Automatically find Seestar telescopes on your network</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleDiscoverTelescopes}
                disabled={discovering}
                className="w-full"
              >
                {discovering ? 'Discovering...' : 'Discover Telescopes'}
              </Button>
            </CardContent>
          </Card>

          {/* Manual Add */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Connection</CardTitle>
              <CardDescription>Add a telescope by IP address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">IP Address</Label>
                  <Input
                    id="host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="4700"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddTelescope} disabled={loading} className="flex-1">
                  Add Telescope
                </Button>
                <Button onClick={handleConnect} disabled={loading || !currentTelescopeId} variant="secondary" className="flex-1">
                  Connect
                </Button>
                <Button onClick={handleDisconnect} disabled={loading || !currentTelescopeId} variant="outline" className="flex-1">
                  Disconnect
                </Button>
              </div>
            </CardContent>
          </Card>

          {telescopes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Available Telescopes</CardTitle>
                <CardDescription>Click to select a telescope</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {telescopes.map(telescope => (
                    <div
                      key={telescope.id}
                      className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        currentTelescopeId === telescope.id
                          ? 'border-primary bg-accent'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setCurrentTelescope(telescope.id)}
                    >
                      <div>
                        <p className="font-semibold">{telescope.name || telescope.id}</p>
                        <p className="text-sm text-muted-foreground">{telescope.host}:{telescope.port}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        telescope.status === 'connected' ? 'bg-green-500 text-white' :
                        telescope.status === 'connecting' ? 'bg-yellow-500 text-white' :
                        telescope.status === 'error' ? 'bg-red-500 text-white' :
                        'bg-gray-300 text-gray-700'
                      }`}>
                        {(telescope.status || 'disconnected').toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* GOTO Tab */}
        <TabsContent value="goto" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GOTO Target</CardTitle>
              <CardDescription>Point the telescope at celestial coordinates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="target">Target Name</Label>
                <Input
                  id="target"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder="M42 - Orion Nebula"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ra">Right Ascension (hours)</Label>
                  <Input
                    id="ra"
                    type="number"
                    step="0.000001"
                    value={ra}
                    onChange={(e) => setRa(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">0 to 24 hours</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dec">Declination (degrees)</Label>
                  <Input
                    id="dec"
                    type="number"
                    step="0.000001"
                    value={dec}
                    onChange={(e) => setDec(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">-90 to +90 degrees</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleGoto} disabled={loading || !currentTelescopeId} className="flex-1">
                  GOTO Target
                </Button>
                <Button onClick={handlePark} disabled={loading || !currentTelescopeId} variant="destructive" className="flex-1">
                  Park Telescope
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Popular Targets</CardTitle>
              <CardDescription>Quick access to common deep sky objects</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'M42 - Orion Nebula', ra: 5.583333, dec: -5.391111 },
                  { name: 'M31 - Andromeda', ra: 0.712, dec: 41.269 },
                  { name: 'M45 - Pleiades', ra: 3.783, dec: 24.117 },
                  { name: 'M13 - Hercules Cluster', ra: 16.694, dec: 36.460 },
                ].map((target) => (
                  <Button
                    key={target.name}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTargetName(target.name)
                      setRa(target.ra)
                      setDec(target.dec)
                    }}
                    className="justify-start"
                  >
                    {target.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Imaging Tab */}
        <TabsContent value="imaging" className="space-y-4">
          {/* Video Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Live View</CardTitle>
              <CardDescription>Real-time video feed from telescope</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <VideoFeed className="w-full h-[400px]" />
              {/* GOTO Progress Overlay */}
              {showGotoOverlay && gotoTarget && (
                <GotoProgressOverlay
                  targetName={gotoTarget.name}
                  targetRa={gotoTarget.ra}
                  targetDec={gotoTarget.dec}
                  onComplete={() => {
                    setShowGotoOverlay(false)
                    addLog(`✓ GOTO to ${gotoTarget.name} complete`)
                  }}
                  onCancel={() => {
                    setShowGotoOverlay(false)
                    addLog(`⚠ GOTO to ${gotoTarget.name} cancelled`)
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Stacking and Focus Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Imaging/Stacking Panel */}
            <ImagingPanel />

            {/* Focus Control Panel */}
            <FocusControlPanel />
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common imaging operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowImageSaveDialog(true)}
                  disabled={!currentTelescopeId || currentTelescope?.status !== 'connected'}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Image
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowPlateSolveDialog(true)}
                  disabled={!currentTelescopeId || currentTelescope?.status !== 'connected'}
                >
                  <Compass className="mr-2 h-4 w-4" />
                  Plate Solve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowPip(!showPip)}
                  disabled={!currentTelescopeId}
                >
                  <PictureInPicture2 className="mr-2 h-4 w-4" />
                  {showPip ? 'Hide' : 'Show'} PiP
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>Recent commands and status messages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-black rounded-md p-4 h-96 overflow-y-auto font-mono text-sm">
                {logs.length === 0 ? (
                  <p className="text-green-400">Ready. Add a telescope to begin.</p>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${
                      log.includes('✓') ? 'text-green-400' :
                      log.includes('✗') ? 'text-red-400' :
                      log.includes('⚠') ? 'text-yellow-400' :
                      'text-gray-300'
                    }`}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Picture-in-Picture Window */}
      <PictureInPicture
        show={showPip}
        onClose={() => setShowPip(false)}
        telescopeId={currentTelescopeId || undefined}
      />

      {/* Image Save Dialog */}
      <ImageSaveDialog
        open={showImageSaveDialog}
        onOpenChange={setShowImageSaveDialog}
        onSaved={(path) => addLog(`✓ Image saved to ${path}`)}
      />

      {/* Plate Solve Dialog */}
      <PlateSolveDialog
        open={showPlateSolveDialog}
        onOpenChange={setShowPlateSolveDialog}
        onSolved={(result) => {
          if (result.ra && result.dec) {
            addLog(`✓ Plate solved: RA ${result.ra.toFixed(4)}°, Dec ${result.dec.toFixed(4)}°`)
          }
        }}
        onSyncMount={(syncRa, syncDec) => {
          addLog(`✓ Mount synced to RA ${syncRa.toFixed(4)}°, Dec ${syncDec.toFixed(4)}°`)
        }}
      />
    </div>
  )
}
