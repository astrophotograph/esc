"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { AlertCircle, RefreshCw, Power, CheckCircle, ExternalLink } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useVersionCheck } from "@/hooks/useVersionCheck"

interface SystemAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SystemAdminDialog({ open, onOpenChange }: SystemAdminDialogProps) {
  const [adminToken, setAdminToken] = useState("")
  const [isRestarting, setIsRestarting] = useState(false)
  const [restartReason, setRestartReason] = useState("Manual restart from UI")
  
  const { versionInfo, isChecking, checkForUpdates } = useVersionCheck({
    checkOnMount: false, // Don't auto-check since this is an admin dialog
  })

  const handleRestart = async () => {
    if (!adminToken) {
      toast.error("Please enter admin token")
      return
    }

    setIsRestarting(true)
    
    try {
      const response = await fetch("/api/system/restart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": adminToken,
        },
        body: JSON.stringify({
          delay_seconds: 3,
          reason: restartReason,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || "Failed to restart server")
      }

      const data = await response.json()
      
      toast.success(data.message, {
        description: `Reason: ${data.reason}`,
        duration: 10000,
      })
      
      // Close dialog after successful request
      setTimeout(() => {
        onOpenChange(false)
        setAdminToken("")
      }, 1000)
      
    } catch (error) {
      toast.error("Failed to restart server", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsRestarting(false)
    }
  }

  const handleShutdown = async () => {
    if (!adminToken) {
      toast.error("Please enter admin token")
      return
    }

    if (!confirm("Are you sure you want to shutdown the server? It will need to be manually restarted.")) {
      return
    }

    try {
      const response = await fetch("/api/system/shutdown?delay_seconds=3", {
        method: "POST",
        headers: {
          "X-Admin-Token": adminToken,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || "Failed to shutdown server")
      }

      const data = await response.json()
      
      toast.success(data.message, {
        duration: 10000,
      })
      
      onOpenChange(false)
      
    } catch (error) {
      toast.error("Failed to shutdown server", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>System Administration</DialogTitle>
          <DialogDescription>
            Restart or shutdown the server. Requires admin authentication.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Server restart will temporarily disconnect all telescopes and clients.
              The server will automatically restart if using the start_with_restart.sh script.
            </AlertDescription>
          </Alert>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="admin-token" className="text-right">
              Admin Token
            </Label>
            <Input
              id="admin-token"
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              className="col-span-3"
              placeholder="Enter admin token"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="restart-reason" className="text-right">
              Reason
            </Label>
            <Input
              id="restart-reason"
              value={restartReason}
              onChange={(e) => setRestartReason(e.target.value)}
              className="col-span-3"
              placeholder="Reason for restart"
            />
          </div>
          
          {/* Version Check Section */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Version Information</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkForUpdates(true)}
                disabled={isChecking}
              >
                {isChecking ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Check for Updates
              </Button>
            </div>
            
            {versionInfo ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Version:</span>
                  <span className="font-mono">{versionInfo.current_version}</span>
                </div>
                
                {versionInfo.update_available ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Latest Version:</span>
                      <span className="font-mono text-green-600">{versionInfo.latest_version}</span>
                    </div>
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Update available! 
                        {versionInfo.release_url && (
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto ml-2"
                            onClick={() => window.open(versionInfo.release_url, '_blank')}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View Release
                          </Button>
                        )}
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : versionInfo.latest_version ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Up to date</span>
                  </div>
                ) : null}
                
                {versionInfo.error && (
                  <div className="text-sm text-red-600">
                    Error: {versionInfo.error}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Click "Check for Updates" to see version information
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="flex gap-2">
          <Button
            variant="destructive"
            onClick={handleShutdown}
            disabled={isRestarting || !adminToken}
          >
            <Power className="w-4 h-4 mr-2" />
            Shutdown
          </Button>
          <Button
            onClick={handleRestart}
            disabled={isRestarting || !adminToken}
          >
            {isRestarting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Restarting...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Restart Server
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}