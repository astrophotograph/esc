import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    
    // Forward all query parameters to the backend
    const backendUrl = new URL(`${BACKEND_URL}/api/catalog/search`)
    searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value)
    })

    const response = await fetch(backendUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Backend request failed: ${response.statusText}`)
    }

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error: any) {
    // Check if it's a connection error
    if (error?.cause?.code === 'ECONNREFUSED') {
      console.warn('Backend server not available at', BACKEND_URL)
      // Return empty results when backend is not available
      return NextResponse.json(
        { 
          objects: [],
          total_count: 0,
          page: 1,
          page_size: 50
        },
        { status: 200 }
      )
    }
    
    console.error('Catalog search error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch catalog data' },
      { status: 500 }
    )
  }
}