import { useEffect, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { allskyImageUrl, withCacheBust } from '../lib/allsky'

interface AllskyImageProps {
  className?: string
  /** How the image fills its box. Allsky frames are usually fisheye, so default to `contain`. */
  fit?: 'contain' | 'cover'
  autoRefresh?: boolean
  refreshMs?: number
}

/**
 * Renders the configured allsky camera feed. Shared by the main view (when the
 * Telescope/All-Sky switcher is on All-Sky) and the floating AllskyPanel.
 *
 * The browser loads the image directly (a cross-origin <img> is allowed), with a
 * cache-busting token so each refresh re-fetches the latest frame. Handles the
 * not-configured and failed-to-load cases with inline messages.
 */
export function AllskyImage({
  className = '',
  fit = 'contain',
  autoRefresh = true,
  refreshMs = 30000,
}: AllskyImageProps) {
  const { allsky } = useUIStore()
  const url = allskyImageUrl(allsky)
  const [token, setToken] = useState(() => Date.now())
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!url || !autoRefresh) return
    const id = setInterval(() => setToken(Date.now()), refreshMs)
    return () => clearInterval(id)
  }, [url, autoRefresh, refreshMs])

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center text-center text-xs text-muted-foreground p-4 ${className}`}
      >
        <span>
          No allsky camera URL configured.
          <br />
          Set one in Settings → Allsky.
        </span>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <img
        src={withCacheBust(url, token)}
        alt="Allsky camera feed"
        className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        onLoad={() => setError(false)}
        onError={() => setError(true)}
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/75 p-4 text-center text-xs text-red-400">
          <span>Couldn&apos;t load the allsky image from:</span>
          <span className="font-mono break-all">{url}</span>
        </div>
      )}
    </div>
  )
}
