import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    if (!body.file_id) {
      return NextResponse.json(
        { error: 'No file_id provided' },
        { status: 400 }
      )
    }

    // Forward request to Python backend
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const response = await fetch(`${backendUrl}/api/processing/reprocess-fits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Backend reprocess error:', errorText)
      return NextResponse.json(
        { error: 'Failed to reprocess FITS file' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('Reprocess error:', error)
    return NextResponse.json(
      { error: 'Failed to reprocess FITS file' },
      { status: 500 }
    )
  }
}