import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(_request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/catalog/object-types`, {
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
      // Return default object types when backend is not available
      return NextResponse.json(
        {
          messier: ['Galaxy', 'Nebula', 'Star Cluster', 'Planetary Nebula', 'Supernova Remnant'],
          ngc: ['Galaxy', 'Nebula', 'Star Cluster', 'Planetary Nebula', 'Double Star'],
          ic: ['Galaxy', 'Nebula', 'Star Cluster'],
          stars: ['Variable Star', 'Double Star', 'Multiple Star', 'Named Star'],
          solar_system: ['Planet', 'Moon', 'Asteroid', 'Comet', 'Meteor Shower']
        },
        { status: 200 }
      )
    }
    
    console.error('Object types fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch object types' },
      { status: 500 }
    )
  }
}