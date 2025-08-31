"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useTelescopeContext } from "@/context/TelescopeContext"
import { formatRaDec } from "@/utils/telescope-utils"
import { Wifi, WifiOff, Target, Moon, Camera, Focus, Thermometer, Battery } from "lucide-react"

export function SimpleTelescopeControl() {
  const {
    currentTelescope,
    isTracking,
    streamStatus,
    focusPosition,
    selectedTarget,
  } = useTelescopeContext()

  const [currentTime, setCurrentTime] = useState(new Date())

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  // Simple retro color scheme for CRT
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'tracking':
      case 'imaging':
        return 'text-green-400'
      case 'disconnected':
      case 'error':
        return 'text-red-400'
      case 'warning':
      case 'idle':
        return 'text-amber-400'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="w-full h-full bg-black text-green-400 font-mono p-4">
      {/* Header */}
      <div className="mb-4 pb-2 border-b border-green-400/30">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">TELESCOPE CONTROL SYSTEM</h1>
          <div className="text-right">
            <div className="text-sm opacity-80">{formatDate(currentTime)}</div>
            <div className="text-lg">{formatTime(currentTime)}</div>
          </div>
        </div>
      </div>

      {/* Main Status Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Connection Status */}
        <div className="border border-green-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            {currentTelescope ? (
              <Wifi className="h-4 w-4 text-green-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-400" />
            )}
            <h2 className="text-sm font-bold">CONNECTION STATUS</h2>
          </div>
          <div className="space-y-1 text-xs">
            <div>
              STATUS: <span className={getStatusColor(currentTelescope ? 'connected' : 'disconnected')}>
                {currentTelescope ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            {currentTelescope && (
              <>
                <div>DEVICE: {currentTelescope.name || 'UNKNOWN'}</div>
                <div>IP: {currentTelescope.ip || 'N/A'}</div>
                <div>PORT: {currentTelescope.port || 'N/A'}</div>
              </>
            )}
          </div>
        </div>

        {/* Tracking Status */}
        <div className="border border-green-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4" />
            <h2 className="text-sm font-bold">TRACKING STATUS</h2>
          </div>
          <div className="space-y-1 text-xs">
            <div>
              MODE: <span className={getStatusColor(isTracking ? 'tracking' : 'idle')}>
                {isTracking ? 'TRACKING' : 'IDLE'}
              </span>
            </div>
            {selectedTarget && (
              <>
                <div>TARGET: {selectedTarget.name}</div>
                <div>RA: {formatRaDec(selectedTarget.ra, 'ra')}</div>
                <div>DEC: {formatRaDec(selectedTarget.dec, 'dec')}</div>
              </>
            )}
          </div>
        </div>

        {/* Camera Status */}
        <div className="border border-green-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Camera className="h-4 w-4" />
            <h2 className="text-sm font-bold">CAMERA STATUS</h2>
          </div>
          <div className="space-y-1 text-xs">
            <div>
              STREAM: <span className={getStatusColor(streamStatus?.is_streaming ? 'connected' : 'disconnected')}>
                {streamStatus?.is_streaming ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            {streamStatus && (
              <>
                <div>EXPOSURE: {streamStatus.exposure || 'AUTO'} ms</div>
                <div>GAIN: {streamStatus.gain || 'AUTO'}</div>
                <div>RESOLUTION: {streamStatus.width || '?'}x{streamStatus.height || '?'}</div>
              </>
            )}
          </div>
        </div>

        {/* Focus Status */}
        <div className="border border-green-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Focus className="h-4 w-4" />
            <h2 className="text-sm font-bold">FOCUS STATUS</h2>
          </div>
          <div className="space-y-1 text-xs">
            <div>POSITION: {focusPosition || 0}</div>
            <div>MODE: MANUAL</div>
            <div className="mt-2">
              <div className="bg-green-400/20 h-2 relative">
                <div 
                  className="absolute top-0 left-0 h-full bg-green-400"
                  style={{ width: `${Math.min(100, (focusPosition || 0) / 100 * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="border border-green-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="h-4 w-4" />
            <h2 className="text-sm font-bold">SYSTEM STATUS</h2>
          </div>
          <div className="space-y-1 text-xs">
            <div>TEMP: {currentTelescope?.status?.temperature || '--'}°C</div>
            <div>HUMIDITY: {currentTelescope?.status?.humidity || '--'}%</div>
            <div>DEW HEATER: {currentTelescope?.status?.dew_heater ? 'ON' : 'OFF'}</div>
          </div>
        </div>

        {/* Power Status */}
        <div className="border border-green-400/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Battery className="h-4 w-4" />
            <h2 className="text-sm font-bold">POWER STATUS</h2>
          </div>
          <div className="space-y-1 text-xs">
            <div>BATTERY: {currentTelescope?.status?.battery_level || '--'}%</div>
            <div>VOLTAGE: {currentTelescope?.status?.voltage || '--'}V</div>
            <div>
              STATUS: <span className={getStatusColor(
                (currentTelescope?.status?.battery_level || 0) > 20 ? 'connected' : 'warning'
              )}>
                {(currentTelescope?.status?.battery_level || 0) > 20 ? 'NORMAL' : 'LOW'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Command Log */}
      <div className="mt-4 border border-green-400/30 p-3">
        <h2 className="text-sm font-bold mb-2">SYSTEM LOG</h2>
        <div className="h-24 overflow-y-auto text-xs space-y-1 font-mono">
          <div className="opacity-80">[{formatTime(currentTime)}] System initialized</div>
          {currentTelescope && (
            <div className="text-green-400">[{formatTime(currentTime)}] Connected to {currentTelescope.name}</div>
          )}
          {isTracking && selectedTarget && (
            <div className="text-amber-400">[{formatTime(currentTime)}] Tracking {selectedTarget.name}</div>
          )}
          {streamStatus?.is_streaming && (
            <div className="text-green-400">[{formatTime(currentTime)}] Camera stream active</div>
          )}
        </div>
      </div>
    </div>
  )
}