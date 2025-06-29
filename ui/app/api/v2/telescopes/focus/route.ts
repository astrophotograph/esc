import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { telescopeId, step } = body

    if (!telescopeId) {
      return NextResponse.json(
        { error: 'Telescope ID is required' },
        { status: 400 }
      )
    }

    if (!step || typeof step !== 'number') {
      return NextResponse.json(
        { error: 'Focus step is required and must be a number' },
        { status: 400 }
      )
    }

    // Call backend API focus endpoint
    const response = await fetch(`${BACKEND_URL}/api/telescopes/${telescopeId}/focus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        step,
        ret_step: true
      }),
    })

    if (!response.ok) {
      throw new Error(`Backend request failed: ${response.status}`)
    }

    const result = await response.json()
    return NextResponse.json(result)

  } catch (error) {
    console.error('Error in telescope focus API:', error)
    return NextResponse.json(
      { error: 'Failed to adjust telescope focus' },
      { status: 500 }
    )
  }
}