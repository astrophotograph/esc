import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Image Upscaling Settings API (Legacy)
 * 
 * Provides access to basic upscaling settings for telescopes.
 * Note: For comprehensive image enhancement, use /enhancement endpoint instead.
 * 
 * Usage:
 *   GET /api/[scope]/upscaling - Get current upscaling settings
 *   POST /api/[scope]/upscaling - Update upscaling settings
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
    const backendUrl = `${backendBaseUrl}/api/${scope}/upscaling`
    console.log(`Fetching upscaling settings for ${scope}: ${backendUrl}`)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SeestarUI/1.0',
      },
    })
    
    if (!response.ok) {
      console.error(`Upscaling settings fetch error for ${scope}: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        { 
          error: 'Failed to fetch upscaling settings',
          telescope: scope,
          status: response.status 
        },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('Error fetching upscaling settings:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch upscaling settings',
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
    const backendUrl = `${backendBaseUrl}/api/${scope}/upscaling`
    console.log(`Updating upscaling settings for ${scope}: ${backendUrl}`)
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
      console.error(`Upscaling settings update error for ${scope}: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      console.error('Error response:', errorText)
      
      return NextResponse.json(
        { 
          error: 'Failed to update upscaling settings',
          telescope: scope,
          status: response.status,
          details: errorText
        },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log('Upscaling settings updated successfully:', data)
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('Error updating upscaling settings:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update upscaling settings',
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