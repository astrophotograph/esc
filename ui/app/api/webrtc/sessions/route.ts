import { NextRequest } from 'next/server'
import { getBackendBaseUrl } from "@/lib/telescopes"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * WebRTC Sessions Endpoint
 * 
 * Proxies WebRTC session management requests to the backend server.
 * Handles session creation, listing, and management.
 */

export async function GET(req: NextRequest) {
  try {
    const backendBaseUrl = getBackendBaseUrl()
    const sessionsUrl = `${backendBaseUrl}/api/webrtc/sessions`
    
    console.log(`Fetching WebRTC sessions from: ${sessionsUrl}`)
    
    const response = await fetch(sessionsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
    })
    
    if (!response.ok) {
      console.error(`WebRTC sessions fetch error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch WebRTC sessions',
          status: response.status,
        }),
        { 
          status: response.status, 
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    const sessions = await response.json()
    
    return new Response(JSON.stringify(sessions), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
    
  } catch (error) {
    console.error('Error fetching WebRTC sessions:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch WebRTC sessions',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const backendBaseUrl = getBackendBaseUrl()
    const sessionsUrl = `${backendBaseUrl}/api/webrtc/sessions`
    
    const body = await req.text()
    
    console.log(`Creating WebRTC session at: ${sessionsUrl}`)
    
    const response = await fetch(sessionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
      body: body,
    })
    
    if (!response.ok) {
      console.error(`WebRTC session creation error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to create WebRTC session',
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
    
  } catch (error) {
    console.error('Error creating WebRTC session:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to create WebRTC session',
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}