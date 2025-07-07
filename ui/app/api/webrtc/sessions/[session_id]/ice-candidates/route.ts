import { NextRequest } from 'next/server'
// import { getBackendBaseUrl } from "@/lib/telescopes"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * WebRTC ICE Candidates Endpoint
 * 
 * Proxies ICE candidate exchange requests to the backend server.
 * Handles adding ICE candidates to WebRTC sessions.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params
    // Use direct backend URL to avoid circular proxy calls
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const iceCandidatesUrl = `${backendBaseUrl}/api/webrtc/sessions/${session_id}/ice-candidates`
    
    const body = await req.text()
    
    console.log(`Adding ICE candidate to session ${session_id}`)
    
    const response = await fetch(iceCandidatesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
      body: body,
    })
    
    if (!response.ok) {
      console.error(`ICE candidate add error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to add ICE candidate',
          status: response.status,
        }),
        { 
          status: response.status, 
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    const result = await response.json()
    
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
    
  } catch (error) {
    console.error('Error adding ICE candidate:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to add ICE candidate',
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}