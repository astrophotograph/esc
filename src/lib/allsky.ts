import type { AllskySettings } from '../stores/uiStore'

/**
 * Compute the effective allsky image URL from the configured camera settings.
 * Returns '' when nothing usable is configured.
 *
 * Single source of truth shared by the Settings panel (preview) and the
 * AllskyPanel (display) so the two can't drift.
 */
export function allskyImageUrl(s: AllskySettings): string {
  switch (s.cameraType) {
    case 'teamallsky':
      return s.hostname ? `http://${s.hostname}/current/tmp/image.jpg` : ''
    case 'indi':
      return s.hostname ? `http://${s.hostname}/indi-allsky/latestimage` : ''
    case 'custom':
      return s.customUrl.trim()
    default:
      return ''
  }
}

/**
 * Append a cache-busting token so each refresh re-fetches the latest frame
 * instead of showing the browser-cached image.
 */
export function withCacheBust(url: string, token: number | string): string {
  if (!url) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}_t=${token}`
}
