"use client"

import { useTelescopeContext } from "@/context/TelescopeContext"
import { useVersionCheck } from "@/hooks/useVersionCheck"
import { Badge } from "@/components/ui/badge"
import packageJson from "../../package.json"

export function VersionFooter() {
  const { liveViewFullscreen } = useTelescopeContext()
  const { versionInfo } = useVersionCheck({
    checkOnMount: true,
    checkIntervalMinutes: 120, // Check every 2 hours in footer
  })

  // Don't show footer in full screen mode
  if (liveViewFullscreen) {
    return null
  }

  const version = packageJson.version || "0.1.0"
  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString().split('T')[0]

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm border-t border-gray-800 py-2 px-4 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>ESC v{version}</span>
            {versionInfo?.update_available && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-green-600 hover:bg-green-700 text-white">
                Update Available
              </Badge>
            )}
          </div>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">Build: {buildDate}</span>
        </div>
        <div className="flex items-center gap-4">
          <a 
            href="https://github.com/astrophotograph/esc" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
          >
            GitHub
          </a>
          <span className="hidden sm:inline">•</span>
          <a 
            href="https://github.com/astrophotograph/esc/issues" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors hidden sm:inline"
          >
            Report Issue
          </a>
        </div>
      </div>
    </footer>
  )
}