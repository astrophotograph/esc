import { useState } from 'react'
import { invoke } from '../services/api'
import { Button } from './ui/button'
import { useTelescopeStore } from '../stores/telescopeStore'

export function TelescopePanel() {
  const [host, setHost] = useState('192.168.1.100')
  const [port, setPort] = useState(4700)
  const [targetName, setTargetName] = useState('M42')
  const [ra, setRa] = useState(5.583333) // Orion Nebula RA in hours
  const [dec, setDec] = useState(-5.391111) // Orion Nebula Dec in degrees
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const telescopes = useTelescopeStore(state => state.telescopes)
  const currentTelescopeId = useTelescopeStore(state => state.currentTelescopeId)
  const setCurrentTelescope = useTelescopeStore(state => state.setCurrentTelescope)

  const handleAddTelescope = async () => {
    setLoading(true)
    setMessage('')
    try {
      const id = `telescope_${Date.now()}`
      await invoke('add_telescope', {
        config: {
          id,
          host,
          port,
          name: `${host}:${port}`
        }
      })
      setMessage(`Telescope added: ${id}`)
      setCurrentTelescope(id)
    } catch (error) {
      setMessage(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!currentTelescopeId) {
      setMessage('Please add a telescope first')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const result = await invoke<string>('connect_telescope', {
        telescopeId: currentTelescopeId
      })
      setMessage(`Connected: ${result}`)
    } catch (error) {
      setMessage(`Connection error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!currentTelescopeId) {
      setMessage('No telescope selected')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const result = await invoke<string>('disconnect_telescope', {
        telescopeId: currentTelescopeId
      })
      setMessage(`Disconnected: ${result}`)
    } catch (error) {
      setMessage(`Disconnect error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleGoto = async () => {
    if (!currentTelescopeId) {
      setMessage('No telescope connected')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const result = await invoke<string>('goto_target', {
        telescopeId: currentTelescopeId,
        params: {
          target_name: targetName,
          ra: ra,
          dec: dec
        }
      })
      setMessage(`GOTO command sent: ${result}`)
    } catch (error) {
      setMessage(`GOTO error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePark = async () => {
    if (!currentTelescopeId) {
      setMessage('No telescope connected')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const result = await invoke<string>('park_telescope', {
        telescopeId: currentTelescopeId
      })
      setMessage(`Park command sent: ${result}`)
    } catch (error) {
      setMessage(`Park error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Telescope */}
      <div className="bg-card border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Add Telescope</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium block mb-2">Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.100"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              placeholder="4700"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleAddTelescope} disabled={loading}>
            Add Telescope
          </Button>
          <Button onClick={handleConnect} disabled={loading || !currentTelescopeId} variant="secondary">
            Connect
          </Button>
          <Button onClick={handleDisconnect} disabled={loading || !currentTelescopeId} variant="outline">
            Disconnect
          </Button>
        </div>
      </div>

      {/* Telescope List */}
      {telescopes.length > 0 && (
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Telescopes</h3>
          <div className="space-y-2">
            {telescopes.map(telescope => (
              <div
                key={telescope.id}
                className={`flex items-center justify-between p-3 border rounded cursor-pointer ${
                  currentTelescopeId === telescope.id ? 'border-primary bg-accent' : ''
                }`}
                onClick={() => setCurrentTelescope(telescope.id)}
              >
                <div>
                  <p className="font-medium">{telescope.name || telescope.id}</p>
                  <p className="text-sm text-muted-foreground">{telescope.host}:{telescope.port}</p>
                </div>
                <div className={`px-2 py-1 rounded text-xs ${
                  telescope.status === 'connected' ? 'bg-green-100 text-green-800' :
                  telescope.status === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
                  telescope.status === 'error' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {telescope.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GOTO Control */}
      <div className="bg-card border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">GOTO Target</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium block mb-2">Target Name</label>
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="M42"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">RA (hours)</label>
            <input
              type="number"
              step="0.000001"
              value={ra}
              onChange={(e) => setRa(Number(e.target.value))}
              placeholder="5.583333"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">Dec (degrees)</label>
            <input
              type="number"
              step="0.000001"
              value={dec}
              onChange={(e) => setDec(Number(e.target.value))}
              placeholder="-5.391111"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleGoto} disabled={loading || !currentTelescopeId}>
            GOTO Target
          </Button>
          <Button onClick={handlePark} disabled={loading || !currentTelescopeId} variant="destructive">
            Park Telescope
          </Button>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.toLowerCase().includes('error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
        }`}>
          <p className="text-sm font-mono">{message}</p>
        </div>
      )}
    </div>
  )
}
