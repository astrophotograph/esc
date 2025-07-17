import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Image Enhancement Settings API
 * 
 * Provides access to comprehensive image enhancement settings for telescopes.
 * 
 * Usage:
 *   GET /api/[scope]/enhancement - Get current enhancement settings
 *   POST /api/[scope]/enhancement - Update enhancement settings
 * 
 * Parameters:
 *   - scope: telescope identifier (IP address, hostname, or serial number)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scope: string }> }
) {
  try {
    const { scope } = await params
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    
    // Proxy request to backend
    const backendUrl = `${backendBaseUrl}/api/${scope}/enhancement`
    console.log(`Fetching enhancement settings for ${scope}: ${backendUrl}`)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
    })
    
    if (!response.ok) {
      console.error(`Enhancement settings fetch error for ${scope}: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        { 
          error: 'Failed to fetch enhancement settings',
          telescope: scope,
          status: response.status 
        },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('Error fetching enhancement settings:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch enhancement settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scope: string }> }
) {
  try {
    const { scope } = await params
    const body = await req.json()
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    
    // Proxy request to backend
    const backendUrl = `${backendBaseUrl}/api/${scope}/enhancement`
    console.log(`Updating enhancement settings for ${scope}: ${backendUrl}`)
    console.log('Request body:', body)
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
      body: JSON.stringify(body),
    })
    
    if (!response.ok) {
      console.error(`Enhancement settings update error for ${scope}: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      console.error('Error response:', errorText)
      
      return NextResponse.json(
        { 
          error: 'Failed to update enhancement settings',
          telescope: scope,
          status: response.status,
          details: errorText
        },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log('Enhancement settings updated successfully:', data)
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('Error updating enhancement settings:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update enhancement settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// OPTIONS handler for CORS preflight requests
export async function OPTIONS(_req: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}