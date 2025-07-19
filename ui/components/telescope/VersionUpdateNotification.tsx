"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ExternalLink, Download, X, RefreshCw, Calendar, Tag } from "lucide-react"
import { useVersionCheck, type VersionInfo } from "@/hooks/useVersionCheck"
import { toast } from "sonner"

export function VersionUpdateNotification() {
  const [showDialog, setShowDialog] = useState(false)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  const { versionInfo, isChecking, checkForUpdates } = useVersionCheck({
    checkOnMount: true,
    checkIntervalMinutes: 60, // Check every hour
    onUpdateAvailable: (info: VersionInfo) => {
      // Don't show if user already dismissed this version
      if (dismissedVersion === info.latest_version) {
        return
      }

      // Show toast notification
      toast.info(`New version available: ${info.latest_version}`, {
        description: info.release_name || "Click to view details",
        action: {
          label: "View",
          onClick: () => setShowDialog(true)
        },
        duration: 10000,
      })
    }
  })

  // Load dismissed version from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('dismissed-version')
    if (dismissed) {
      setDismissedVersion(dismissed)
    }
  }, [])

  // Auto-show dialog if update is available and not dismissed
  useEffect(() => {
    if (versionInfo?.update_available && 
        versionInfo.latest_version !== dismissedVersion &&
        !showDialog) {
      // Small delay to avoid showing immediately on page load
      const timer = setTimeout(() => {
        setShowDialog(true)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [versionInfo, dismissedVersion, showDialog])

  const handleDismiss = () => {
    if (versionInfo?.latest_version) {
      setDismissedVersion(versionInfo.latest_version)
      localStorage.setItem('dismissed-version', versionInfo.latest_version)
    }
    setShowDialog(false)
  }

  const handleViewRelease = () => {
    if (versionInfo?.release_url) {
      window.open(versionInfo.release_url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleDownload = () => {
    if (versionInfo?.download_url) {
      window.open(versionInfo.download_url, '_blank', 'noopener,noreferrer')
    } else if (versionInfo?.release_url) {
      // Fallback to release page
      window.open(versionInfo.release_url, '_blank', 'noopener,noreferrer')
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  if (!versionInfo?.update_available) {
    return null
  }

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            Update Available
          </DialogTitle>
          <DialogDescription>
            A new version of Experimental Scope Creep is available
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Version:</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{versionInfo.current_version}</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge className="bg-green-600 hover:bg-green-700">
                {versionInfo.latest_version}
              </Badge>
            </div>
          </div>

          {versionInfo.release_name && (
            <div>
              <h4 className="font-medium mb-2">{versionInfo.release_name}</h4>
            </div>
          )}

          {versionInfo.release_date && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Released {formatDate(versionInfo.release_date)}
            </div>
          )}

          {versionInfo.release_notes && (
            <div>
              <h5 className="font-medium text-sm mb-2">Release Notes:</h5>
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md max-h-32 overflow-y-auto">
                {versionInfo.release_notes}
              </div>
            </div>
          )}

          <Alert>
            <AlertDescription>
              Updates may include new features, bug fixes, and security improvements.
              Visit the release page for complete details.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleDismiss}>
            <X className="w-4 h-4 mr-2" />
            Dismiss
          </Button>
          
          {versionInfo.download_url && (
            <Button variant="secondary" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}
          
          <Button onClick={handleViewRelease}>
            <ExternalLink className="w-4 h-4 mr-2" />
            View Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}