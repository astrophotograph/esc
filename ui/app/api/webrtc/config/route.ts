import { NextRequest } from 'next/server'
import { getBackendBaseUrl } from "@/lib/telescopes"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * WebRTC Configuration Endpoint
 * 
 * Proxies WebRTC configuration requests to the backend server.
 * Provides STUN/TURN server configuration for WebRTC connections.
 */

export async function GET(req: NextRequest) {
  try {
    const backendBaseUrl = getBackendBaseUrl()
    const configUrl = `${backendBaseUrl}/api/webrtc/config`
    
    console.log(`Fetching WebRTC config from: ${configUrl}`)
    
    const response = await fetch(configUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
    })
    
    if (!response.ok) {
      console.error(`WebRTC config fetch error: ${response.status} ${response.statusText}`)
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch WebRTC configuration',
          status: response.status,
        }),
        { 
          status: response.status, 
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    const config = await response.json()
    
    return new Response(JSON.stringify(config), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
    
  } catch (error) {
    console.error('Error fetching WebRTC config:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch WebRTC configuration',
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
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}