import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { telescopeId } = body

    if (!telescopeId) {
      return NextResponse.json(
        { error: 'Telescope ID is required' },
        { status: 400 }
      )
    }

    // Call backend API park endpoint
    const response = await fetch(`${BACKEND_URL}/api/telescopes/${telescopeId}/park`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Backend request failed: ${response.status}`)
    }

    const result = await response.json()
    return NextResponse.json(result)

  } catch (error) {
    console.error('Error in telescope park API:', error)
    return NextResponse.json(
      { error: 'Failed to park telescope' },
      { status: 500 }
    )
  }
}