import {NextRequest} from 'next/server'
import {getBackendBaseUrl} from "@/lib/telescopes"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Telescope Streaming Image Endpoint
 *
 * Provides access to various camera feeds from telescopes through a unified API.
 *
 * Usage:
 *   GET /api/[scope]/stream?type=[streamType]
 *
 * Parameters:
 *   - scope: telescope identifier (serial number, hostname, or IP address)
 *   - type: stream type (optional, defaults to 'video')
 *
 * Available stream types:
 *   - video, live: Main telescope camera feed
 *   - preview, thumb: Preview/thumbnail images
 *   - allsky: All-sky camera feed
 *   - guide: Guide camera feed
 *   - finder: Finder camera feed
 *
 * Examples:
 *   /api/192.168.1.100/stream?type=video
 *   /api/seestar-s50/stream?type=allsky
 *   /api/ABC123456/stream?type=guide
 */

export async function GET(req: NextRequest,
                          {params}: { params: Promise<{ scope: string }> },
) {
  try {
    const {scope} = await params

    // Get the stream type from query parameters (defaults to 'video')
    const streamType = req.nextUrl.searchParams.get('type') || 'video'

    // Build the streaming URL based on the telescope scope and stream type
    const streamUrl = buildStreamUrl(scope, streamType)

    if (!streamUrl) {
      return new Response(
        JSON.stringify({error: `Invalid stream type: ${streamType}`}),
        {status: 400, headers: {'Content-Type': 'application/json'}},
      )
    }

    console.log(`Proxying ${streamType} stream for ${scope}: ${streamUrl}`)

    // Fetch the stream from the telescope
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/jpeg, image/png, */*',
        'User-Agent': 'SeestarUI/1.0',
      },
      // Add timeout to prevent hanging requests
      // signal: AbortSignal.timeout(30000), // 30 second timeout
    })

    if (!response.ok) {
      console.error(`Stream fetch error for ${scope}: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to connect to telescope stream',
          telescope: scope,
          streamType: streamType,
          url: streamUrl,
        }),
        {status: response.status, headers: {'Content-Type': 'application/json'}},
      )
    }

    // Check if the response is a readable stream
    if (!response.body) {
      return new Response(
        JSON.stringify({error: 'No response body from telescope stream'}),
        {status: 500, headers: {'Content-Type': 'application/json'}},
      )
    }

    // Get content type from the telescope response
    const contentType = response.headers.get('content-type') || 'image/jpeg'

    // Create a new response with the telescope's stream
    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error) {
    console.error('Error proxying telescope stream:', error)

    // Return a generic error that doesn't expose internal details
    return new Response(
      JSON.stringify({
        error: 'Failed to proxy telescope stream',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {status: 500, headers: {'Content-Type': 'application/json'}},
    )
  }
}

/**
 * Build the streaming URL for a given telescope scope and stream type
 */
function buildStreamUrl(scope: string, streamType: string): string | null {
  // Get telescope host from scope - in production this would come from telescope configuration
  // For now, assume scope contains the telescope identifier
  const backendBaseUrl = getBackendBaseUrl()

  switch (streamType) {
    case 'video':
    case 'live':
      // Main video stream
      return `${backendBaseUrl}/api/telescopes/${scope}/stream`

    // case 'preview':
    // case 'thumb':
    //   // Preview/thumbnail stream
    //   return `http://${telescopeHost}:5556/1/preview`
    //
    // case 'allsky':
    //   // All-sky camera
    //   return `http://${telescopeHost}/current/tmp/image.jpg`
    //
    // case 'guide':
    //   // Guide camera
    //   return `http://${telescopeHost}:5557/1/vid`
    //
    // case 'finder':
    //   // Finder camera
    //   return `http://${telescopeHost}:5558/1/vid`
    //
    default:
      return null
  }
}

/**
 * Extract telescope host from scope identifier
 * In production, this would lookup the telescope configuration from a database
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getTelescopeHost(scope: string): Promise<string> {


  // For now, handle common patterns:
  // - Direct IP: "192.168.1.100" -> "192.168.1.100"
  // - Hostname: "seestar-s50" -> "seestar-s50"
  // - UUID or serial: fallback to "localhost"

  // Check if scope looks like an IP address
  const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
  if (ipPattern.test(scope)) {
    return scope
  }

  // Check if scope looks like a hostname
  const hostnamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  if (hostnamePattern.test(scope)) {
    return scope
  }

  // Default fallback - in production, this should query telescope registry
  console.warn(`Unable to determine host for scope: ${scope}, falling back to localhost`)
  return 'localhost'
}

// OPTIONS handler for CORS preflight requests
export async function OPTIONS(_req: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
