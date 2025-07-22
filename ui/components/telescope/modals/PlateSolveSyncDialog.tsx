"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Target, MapPin, ArrowRight } from "lucide-react"
import { formatRaDec } from "../../../utils/telescope-utils"

export interface PlateSolveResult {
  success: boolean
  ra?: number
  dec?: number
  orientation?: number
  pixscale?: number
  field_width?: number
  field_height?: number
  error?: string
}

export interface PlateSolveSyncDialogProps {
  isOpen: boolean
  onClose: () => void
  currentRa?: number
  currentDec?: number
  plateSolveResult: PlateSolveResult | null
  isLoading: boolean
  onSync: () => void
  onCancel: () => void
}

export function PlateSolveSyncDialog({
  isOpen,
  onClose,
  currentRa,
  currentDec,
  plateSolveResult,
  isLoading,
  onSync,
  onCancel,
}: PlateSolveSyncDialogProps) {
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await onSync()
    } finally {
      setIsSyncing(false)
    }
  }

  const handleCancel = () => {
    onCancel()
    onClose()
  }

  // Calculate position difference
  const getPositionDifference = () => {
    if (!plateSolveResult?.success || !plateSolveResult.ra || !plateSolveResult.dec || !currentRa || !currentDec) {
      return null
    }

    const raDiff = Math.abs(plateSolveResult.ra - currentRa)
    const decDiff = Math.abs(plateSolveResult.dec - currentDec)
    
    // Convert to arcminutes for better readability
    const raArcmin = raDiff * 60 * Math.cos((currentDec * Math.PI) / 180) // Account for declination
    const decArcmin = decDiff * 60

    return {
      raDiff: raDiff,
      decDiff: decDiff,
      raArcmin: raArcmin,
      decArcmin: decArcmin,
      totalArcmin: Math.sqrt(raArcmin * raArcmin + decArcmin * decArcmin)
    }
  }

  const positionDiff = getPositionDifference()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5" />
            Plate Solve & Sync Results
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            {isLoading
              ? "Solving the current image with astrometry.net..."
              : plateSolveResult?.success
              ? "Plate solving successful! Review the coordinates below and sync if desired."
              : "Plate solving failed. Please try again or check your image."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-300">Processing image...</span>
            </div>
          )}

          {!isLoading && plateSolveResult?.error && (
            <Card className="bg-red-900/20 border-red-700">
              <CardHeader>
                <CardTitle className="text-red-400 text-sm">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-300 text-sm">{plateSolveResult.error}</p>
              </CardContent>
            </Card>
          )}

          {!isLoading && plateSolveResult?.success && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current Position */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-300 text-sm flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Current Position
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <span className="text-gray-400">RA:</span>
                      <span className="ml-2 text-white font-mono">
                        {formatRaDec(currentRa, "ra") || "N/A"}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-400">Dec:</span>
                      <span className="ml-2 text-white font-mono">
                        {formatRaDec(currentDec, "dec") || "N/A"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 pt-1">
                      <div>RA: {currentRa?.toFixed(6)}°</div>
                      <div>Dec: {currentDec?.toFixed(6)}°</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Plate Solved Position */}
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-green-400 text-sm flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Plate Solved Position
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <span className="text-gray-400">RA:</span>
                      <span className="ml-2 text-white font-mono">
                        {formatRaDec(plateSolveResult.ra, "ra") || "N/A"}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-400">Dec:</span>
                      <span className="ml-2 text-white font-mono">
                        {formatRaDec(plateSolveResult.dec, "dec") || "N/A"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 pt-1">
                      <div>RA: {plateSolveResult.ra?.toFixed(6)}°</div>
                      <div>Dec: {plateSolveResult.dec?.toFixed(6)}°</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Position Difference */}
              {positionDiff && (
                <Card className="bg-yellow-900/20 border-yellow-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-yellow-400 text-sm flex items-center gap-2">
                      <ArrowRight className="w-4 h-4" />
                      Position Difference
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">RA Diff:</span>
                        <span className="ml-2 text-white">
                          {positionDiff.raArcmin.toFixed(2)}′
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Dec Diff:</span>
                        <span className="ml-2 text-white">
                          {positionDiff.decArcmin.toFixed(2)}′
                        </span>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-400">Total Offset:</span>
                      <span className="ml-2 text-white font-semibold">
                        {positionDiff.totalArcmin.toFixed(2)}′
                      </span>
                    </div>
                    {positionDiff.totalArcmin > 60 && (
                      <div className="text-xs text-yellow-300 pt-1">
                        ⚠️ Large offset detected ({(positionDiff.totalArcmin / 60).toFixed(1)}°)
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Additional Plate Solve Info */}
              {(plateSolveResult.orientation !== undefined || 
                plateSolveResult.pixscale !== undefined || 
                plateSolveResult.field_width !== undefined) && (
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-300 text-sm">Additional Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    {plateSolveResult.orientation !== undefined && (
                      <div>
                        <span className="text-gray-400">Orientation:</span>
                        <span className="ml-2 text-gray-300">{plateSolveResult.orientation.toFixed(2)}°</span>
                      </div>
                    )}
                    {plateSolveResult.pixscale !== undefined && (
                      <div>
                        <span className="text-gray-400">Pixel Scale:</span>
                        <span className="ml-2 text-gray-300">{plateSolveResult.pixscale.toFixed(2)}" per pixel</span>
                      </div>
                    )}
                    {plateSolveResult.field_width !== undefined && plateSolveResult.field_height !== undefined && (
                      <div>
                        <span className="text-gray-400">Field Size:</span>
                        <span className="ml-2 text-gray-300">
                          {plateSolveResult.field_width.toFixed(2)}° × {plateSolveResult.field_height.toFixed(2)}°
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={handleCancel}
            className="border-gray-600 text-white hover:bg-gray-700"
          >
            Cancel
          </Button>
          {!isLoading && plateSolveResult?.success && (
            <Button 
              onClick={handleSync}
              disabled={isSyncing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isSyncing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sync Telescope
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}