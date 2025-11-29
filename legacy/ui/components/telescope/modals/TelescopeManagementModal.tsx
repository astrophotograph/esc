"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useTelescopeContext } from "@/context/TelescopeContext"
import type { TelescopeInfo, RemoteController } from "@/types/telescope-types"
import {
  Telescope,
  Plus,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  Settings,
  MapPin,
  Radio,
  Check,
  Server,
  RotateCcw,
  Globe,
} from "lucide-react"

interface TelescopeManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const getStatusIcon = (status: TelescopeInfo["status"]) => {
  switch (status) {
    case "online":
      return <Wifi className="w-4 h-4 text-green-500" />
    case "offline":
      return <WifiOff className="w-4 h-4 text-red-500" />
    case "maintenance":
      return <Settings className="w-4 h-4 text-blue-500" />
    case "error":
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />
    default:
      return <WifiOff className="w-4 h-4 text-gray-500" />
  }
}

const getStatusText = (status: TelescopeInfo["status"]) => {
  switch (status) {
    case "online":
      return "Online"
    case "offline":
      return "Offline"
    case "maintenance":
      return "Maintenance"
    case "error":
      return "Error"
    default:
      return "Unknown"
  }
}


export function TelescopeManagementModal({
  open,
  onOpenChange,
}: TelescopeManagementModalProps) {
  const {
    telescopes,
    currentTelescope,
    isLoadingTelescopes,
    fetchTelescopes,
    selectTelescope,
    addManualTelescope,
    removeManualTelescope,
    addStatusAlert,
    remoteControllers,
    isLoadingRemoteControllers,
    fetchRemoteControllers,
    addRemoteController,
    removeRemoteController,
    reconnectRemoteController,
  } = useTelescopeContext()

  // Default to "add" tab if no telescopes exist, otherwise "discovered"
  const [activeTab, setActiveTab] = useState(
    telescopes.length === 0 ? "add" : "discovered"
  )

  // Manual telescope addition form state
  const [manualName, setManualName] = useState("")
  const [manualHost, setManualHost] = useState("")
  const [manualPort, setManualPort] = useState("4700")
  const [manualType, setManualType] = useState("Seestar S30")
  const [manualSerialNumber, setManualSerialNumber] = useState("")
  const [manualSsid, setManualSsid] = useState("")
  const [manualLocation, setManualLocation] = useState("")
  const [isAddingManual, setIsAddingManual] = useState(false)

  // Remote controller form state
  const [remoteHost, setRemoteHost] = useState("")
  const [remotePort, setRemotePort] = useState("8000")
  const [remoteName, setRemoteName] = useState("")
  const [remoteDescription, setRemoteDescription] = useState("")
  const [isAddingRemote, setIsAddingRemote] = useState(false)

  // Separate discovered and manual telescopes
  // If discovery_method is not specified, assume it's auto-discovered
  const discoveredTelescopes = telescopes.filter(t => !t.discovery_method || t.discovery_method === 'auto_discovery')
  const manualTelescopes = telescopes.filter(t => t.discovery_method === 'manual')

  const handleAddManualTelescope = async () => {
    if (!manualName || !manualHost || !manualPort) {
      addStatusAlert({
        type: "error",
        title: "Missing Information",
        message: "Please provide telescope name, host, and port",
      })
      return
    }

    setIsAddingManual(true)

    try {
      // Create manual telescope entry
      const newTelescope = {
        name: manualName,
        host: manualHost,
        port: parseInt(manualPort),
        connected: false,
        serial_number: manualSerialNumber || `manual-${manualName.toLowerCase().replace(/\s+/g, '-')}`,
        product_model: manualType,
        ssid: manualSsid,
        status: 'offline' as const,
        type: manualType,
        isConnected: false,
        description: `${manualHost}:${manualPort}`,
        location: manualLocation,
        isManual: true,
      }

      await addManualTelescope(newTelescope)

      // Reset form
      setManualName("")
      setManualHost("")
      setManualPort("4700")
      setManualType("Seestar S30")
      setManualSerialNumber("")
      setManualSsid("")
      setManualLocation("")

      setActiveTab("manual")
    } catch (error) {
      console.error('Error adding manual telescope:', error)
    } finally {
      setIsAddingManual(false)
    }
  }

  const handleRemoveTelescope = async (telescope: TelescopeInfo) => {
    try {
      await removeManualTelescope(telescope.id)
    } catch (error) {
      console.error('Error removing telescope:', error)
    }
  }

  const handleAddRemoteController = async () => {
    if (!remoteHost || !remotePort) {
      addStatusAlert({
        type: "error",
        title: "Missing Information",
        message: "Please provide host and port for the remote controller",
      })
      return
    }

    setIsAddingRemote(true)

    try {
      await addRemoteController({
        host: remoteHost,
        port: parseInt(remotePort),
        name: remoteName || undefined,
        description: remoteDescription || undefined,
      })

      // Reset form
      setRemoteHost("")
      setRemotePort("8000")
      setRemoteName("")
      setRemoteDescription("")

      setActiveTab("remote")
    } catch (error) {
      console.error('Error adding remote controller:', error)
    } finally {
      setIsAddingRemote(false)
    }
  }

  const handleRemoveRemoteController = async (host: string, port: number) => {
    try {
      await removeRemoteController(host, port)
    } catch (error) {
      console.error('Error removing remote controller:', error)
    }
  }

  const handleReconnectRemoteController = async (host: string, port: number) => {
    try {
      await reconnectRemoteController(host, port)
    } catch (error) {
      console.error('Error reconnecting remote controller:', error)
    }
  }

  const TelescopeCard = ({ telescope }: { telescope: TelescopeInfo }) => (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Telescope className="w-4 h-4" />
              {telescope.name || telescope.host}
              {telescope.discovery_method && (
                <Badge
                  variant="secondary"
                  className={`text-xs ${
                    telescope.discovery_method === 'manual' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-green-600 text-white'
                  }`}
                >
                  {telescope.discovery_method === 'manual' ? 'Manual' : 'Auto-discovered'}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm text-gray-400">
              {telescope.product_model || telescope.type || 'Unknown Type'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon(telescope.status)}
            <Badge
              variant="secondary"
              className={`text-xs ${
                telescope.status === 'online'
                  ? 'bg-green-500 hover:bg-green-600'
                  : telescope.status === 'offline'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-gray-500 hover:bg-gray-600'
              } text-white border-0`}
            >
              {getStatusText(telescope.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <MapPin className="w-3 h-3" />
            <span>{telescope.location || 'Unknown Location'}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-gray-500">Host:</span>
            <span className="font-mono">{telescope.host}:{telescope.port}</span>
          </div>
          {telescope.ssid && (
            <div className="flex items-center gap-2 text-gray-400">
              <Radio className="w-3 h-3" />
              <span>{telescope.ssid}</span>
            </div>
          )}
          {telescope.serial_number && (
            <div className="flex items-center gap-2 text-gray-400">
              <span className="text-gray-500">Serial:</span>
              <span className="font-mono">{telescope.serial_number}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          {currentTelescope?.id === telescope.id ? (
            <Badge className="bg-blue-600 text-white">Active</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => selectTelescope(telescope)}
              className="flex-1"
            >
              <Check className="w-3 h-3 mr-1" />
              Select
            </Button>
          )}
          {telescope.discovery_method === 'manual' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRemoveTelescope(telescope)}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )

  const RemoteControllerCard = ({ controller }: { controller: RemoteController }) => (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="w-4 h-4" />
              {controller.name || `${controller.host}:${controller.port}`}
              <Badge
                variant="secondary"
                className="text-xs bg-purple-600 text-white"
              >
                Remote Controller
              </Badge>
            </CardTitle>
            <CardDescription className="text-sm text-gray-400">
              {controller.description || 'Remote telescope controller'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {controller.status === 'connected' ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : controller.status === 'connecting' ? (
              <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <Badge
              variant="secondary"
              className={`text-xs ${
                controller.status === 'connected'
                  ? 'bg-green-500 hover:bg-green-600'
                  : controller.status === 'connecting'
                  ? 'bg-yellow-500 hover:bg-yellow-600'
                  : 'bg-red-500 hover:bg-red-600'
              } text-white border-0`}
            >
              {controller.status === 'connected' ? 'Connected' :
               controller.status === 'connecting' ? 'Connecting' :
               controller.status === 'error' ? 'Error' : 'Disconnected'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <Globe className="w-3 h-3" />
            <span className="font-mono">{controller.host}:{controller.port}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Telescope className="w-3 h-3" />
            <span>{controller.telescopes_count} telescope{controller.telescopes_count !== 1 ? 's' : ''}</span>
          </div>
          {controller.last_connected && (
            <div className="flex items-center gap-2 text-gray-400">
              <span className="text-gray-500">Last connected:</span>
              <span>{new Date(controller.last_connected).toLocaleString()}</span>
            </div>
          )}
          {controller.error && (
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-3 h-3" />
              <span className="text-xs">{controller.error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          {controller.status !== 'connected' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleReconnectRemoteController(controller.host, controller.port)}
              className="flex-1"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reconnect
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRemoveRemoteController(controller.host, controller.port)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl">Telescope Management</DialogTitle>
          <DialogDescription>
            Manage discovered and manually added telescopes
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-4 bg-gray-800">
            <TabsTrigger value="discovered" className="data-[state=active]:bg-gray-700">
              Discovered ({discoveredTelescopes.length})
            </TabsTrigger>
            <TabsTrigger value="manual" className="data-[state=active]:bg-gray-700">
              Manual ({manualTelescopes.length})
            </TabsTrigger>
            <TabsTrigger value="remote" className="data-[state=active]:bg-gray-700">
              Remote Controllers
            </TabsTrigger>
            <TabsTrigger value="add" className="data-[state=active]:bg-gray-700">
              Add New
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discovered" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Telescopes discovered automatically on your network
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchTelescopes}
                  disabled={isLoadingTelescopes}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingTelescopes ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                {discoveredTelescopes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Telescope className="w-12 h-12 mb-2" />
                    <p>No telescopes discovered</p>
                    <p className="text-sm">Try refreshing or add one manually</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {discoveredTelescopes.map((telescope) => (
                      <TelescopeCard key={telescope.id} telescope={telescope} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Manually added telescopes that weren&apos;t automatically discovered
              </p>

              <ScrollArea className="h-[400px] pr-4">
                {manualTelescopes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Plus className="w-12 h-12 mb-2" />
                    <p>No manual telescopes added</p>
                    <p className="text-sm">Add a telescope using the &quot;Add New&quot; tab</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {manualTelescopes.map((telescope) => (
                      <TelescopeCard key={telescope.id} telescope={telescope} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="remote" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Remote telescope controllers on your network
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchRemoteControllers}
                  disabled={isLoadingRemoteControllers}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingRemoteControllers ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              <ScrollArea className="h-[400px] pr-4">
                {remoteControllers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Server className="w-12 h-12 mb-2" />
                    <p>No remote controllers configured</p>
                    <p className="text-sm">Add one using the &quot;Add New&quot; tab</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {remoteControllers.map((controller) => (
                      <RemoteControllerCard
                        key={`${controller.host}:${controller.port}`}
                        controller={controller}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {/* Remote Controller Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-semibold">Add Remote Controller</h3>
                  </div>
                  <p className="text-sm text-gray-400">
                    Connect to another ALP instance to access its telescopes
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                    <Label htmlFor="remoteHost">Host/IP Address *</Label>
                    <Input
                      id="remoteHost"
                      placeholder="192.168.1.100"
                      value={remoteHost}
                      onChange={(e) => setRemoteHost(e.target.value)}
                      className="bg-gray-800 border-gray-700"
                    />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="remotePort">Port *</Label>
                    <Input
                      id="remotePort"
                      type="number"
                      placeholder="8000"
                      value={remotePort}
                      onChange={(e) => setRemotePort(e.target.value)}
                      className="bg-gray-800 border-gray-700"
                    />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="remoteName">Name (Optional)</Label>
                      <Input
                      id="remoteName"
                      placeholder="Observatory Controller"
                      value={remoteName}
                      onChange={(e) => setRemoteName(e.target.value)}
                      className="bg-gray-800 border-gray-700"
                    />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="remoteDescription">Description (Optional)</Label>
                      <Input
                      id="remoteDescription"
                      placeholder="Remote telescope controller"
                      value={remoteDescription}
                      onChange={(e) => setRemoteDescription(e.target.value)}
                      className="bg-gray-800 border-gray-700"
                    />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                      setRemoteHost("")
                      setRemotePort("8000")
                      setRemoteName("")
                      setRemoteDescription("")
                    }}
                    >
                      Clear
                    </Button>
                    <Button
                      onClick={handleAddRemoteController}
                      disabled={isAddingRemote || !remoteHost || !remotePort}
                    >
                    {isAddingRemote ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Remote Controller
                      </>
                    )}
                    </Button>
                  </div>
                </div>

                <Separator className="bg-gray-700" />

                {/* Manual Telescope Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Telescope className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold">Add Manual Telescope</h3>
                  </div>
                  <p className="text-sm text-gray-400">
                    Add a telescope that wasn&apos;t automatically discovered
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Telescope Name *</Label>
                  <Input
                    id="name"
                    placeholder="My Seestar"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Telescope Type</Label>
                  <Select value={manualType} onValueChange={setManualType}>
                    <SelectTrigger className="bg-gray-800 border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="Seestar S30">Seestar S30</SelectItem>
                      <SelectItem value="Seestar S50">Seestar S50</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="host">Host/IP Address *</Label>
                  <Input
                    id="host"
                    placeholder="192.168.1.100"
                    value={manualHost}
                    onChange={(e) => setManualHost(e.target.value)}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port *</Label>
                  <Input
                    id="port"
                    type="number"
                    placeholder="4700"
                    value={manualPort}
                    onChange={(e) => setManualPort(e.target.value)}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serial">Serial Number</Label>
                  <Input
                    id="serial"
                    placeholder="cfcf05c4"
                    value={manualSerialNumber}
                    onChange={(e) => setManualSerialNumber(e.target.value)}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ssid">Network SSID</Label>
                  <Input
                    id="ssid"
                    placeholder="S30_cfcf05c4"
                    value={manualSsid}
                    onChange={(e) => setManualSsid(e.target.value)}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="Backyard Observatory"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    className="bg-gray-800 border-gray-700"
                  />
                </div>
              </div>

              <Separator className="bg-gray-700" />

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setManualName("")
                    setManualHost("")
                    setManualPort("4700")
                    setManualType("Seestar S30")
                    setManualSerialNumber("")
                    setManualSsid("")
                    setManualLocation("")
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={handleAddManualTelescope}
                  disabled={isAddingManual || !manualName || !manualHost || !manualPort}
                >
                  {isAddingManual ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Telescope
                    </>
                  )}
                </Button>
              </div>
              </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
