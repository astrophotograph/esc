"use client"

import { useTelescopeContext } from "@/context/TelescopeContext"
import { useVersionCheck } from "@/context/VersionCheckContext"
import { Badge } from "@/components/ui/badge"

// Try to import build info, fallback to package.json
let buildInfo: any = null;
let packageJson: any = null;

try {
  buildInfo = require("../../build-info.json");
} catch (e) {
  // Fallback to package.json if build-info.json doesn't exist
  try {
    packageJson = require("../../package.json");
  } catch (e2) {
    // Ultimate fallback
  }
}

export function VersionFooter() {
  const { liveViewFullscreen } = useTelescopeContext()
  const { versionInfo } = useVersionCheck()

  // Don't show footer in full screen mode
  if (liveViewFullscreen) {
    return null
  }

  // Use build info if available, otherwise fallback to package.json or defaults
  const version = buildInfo?.version || packageJson?.version || "25.07.26-pre-alpha"
  const buildDate = buildInfo?.buildDate 
    ? new Date(buildInfo.buildDate).toISOString().split('T')[0]
    : (process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString().split('T')[0])
  const buildNumber = buildInfo?.buildNumber || 'local'
  const gitHash = buildInfo?.git?.hash
  
  // Format version display - show phase prominently if present
  const formatVersionDisplay = (ver: string) => {
    const phaseMatch = ver.match(/^(\d{2}\.\d{2}\.\d{2})-?(pre-alpha|alpha|beta|rc)\.?(\d+)?/);
    if (phaseMatch) {
      const [, baseVer, phase, patch] = phaseMatch;
      const patchStr = patch ? `.${patch}` : '';
      return { base: baseVer, phase: `${phase}${patchStr}`, hasPhase: true };
    }
    return { base: ver, phase: null, hasPhase: false };
  }
  
  const versionDisplay = formatVersionDisplay(version)

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm border-t border-gray-800 py-2 px-4 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>ESC v{versionDisplay.base}</span>
            {versionDisplay.hasPhase && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5 border-amber-600 text-amber-600">
                {versionDisplay.phase}
              </Badge>
            )}
            {versionInfo?.update_available && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5 bg-green-600 hover:bg-green-700 text-white">
                Update Available
              </Badge>
            )}
          </div>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">Build: {buildDate}</span>
          {gitHash && (
            <>
              <span className="hidden md:inline">•</span>
              <span className="hidden md:inline font-mono">{gitHash}</span>
            </>
          )}
          {buildNumber !== 'local' && (
            <>
              <span className="hidden lg:inline">•</span>
              <span className="hidden lg:inline">#{buildNumber}</span>
            </>
          )}
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