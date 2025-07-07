import { NextRequest } from 'next/server'
import { getBackendBaseUrl } from "@/lib/telescopes"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * WebRTC ICE Candidates Stream Endpoint
 * 
 * Proxies Server-Sent Events stream for ICE candidates from the backend server.
 * Provides real-time ICE candidate exchange during WebRTC connection setup.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params
    const backendBaseUrl = getBackendBaseUrl()
    const streamUrl = `${backendBaseUrl}/webrtc/sessions/${session_id}/ice-candidates/stream`
    
    console.log(`Starting ICE candidates stream for session ${session_id}`)
    
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'User-Agent': 'SeestarUI/1.0',
      },
    })
    
    if (!response.ok) {
      console.error(`ICE candidates stream error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to start ICE candidates stream',
          status: response.status,
        }),
        { 
          status: response.status, 
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Check if the response has a body
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'No response body from ICE candidates stream' }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Stream the Server-Sent Events from the backend
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      },
    })
    
  } catch (error) {
    console.error('Error proxying ICE candidates stream:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to proxy ICE candidates stream',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

// OPTIONS handler for CORS preflight requests
export async function OPTIONS(_req: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
      'Access-Control-Max-Age': '86400',
    },
  })
}