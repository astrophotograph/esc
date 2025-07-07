import { NextRequest } from 'next/server'
// import { getBackendBaseUrl } from "@/lib/telescopes"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * WebRTC Session by ID Endpoint
 * 
 * Proxies individual WebRTC session requests to the backend server.
 * Handles session retrieval and deletion.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params
    // Use direct backend URL to avoid circular proxy calls
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const sessionUrl = `${backendBaseUrl}/api/webrtc/sessions/${session_id}`
    
    console.log(`Fetching WebRTC session from: ${sessionUrl}`)
    
    const response = await fetch(sessionUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
    })
    
    if (!response.ok) {
      console.error(`WebRTC session fetch error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch WebRTC session',
          status: response.status,
        }),
        { 
          status: response.status, 
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    const session = await response.json()
    
    return new Response(JSON.stringify(session), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
    
  } catch (error) {
    console.error('Error fetching WebRTC session:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch WebRTC session',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params
    // Use direct backend URL to avoid circular proxy calls
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const sessionUrl = `${backendBaseUrl}/api/webrtc/sessions/${session_id}`
    
    console.log(`Deleting WebRTC session at: ${sessionUrl}`)
    
    const response = await fetch(sessionUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
    })
    
    if (!response.ok) {
      console.error(`WebRTC session deletion error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to delete WebRTC session',
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
        'Access-Control-Allow-Methods': 'GET, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
    
  } catch (error) {
    console.error('Error deleting WebRTC session:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to delete WebRTC session',
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
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}