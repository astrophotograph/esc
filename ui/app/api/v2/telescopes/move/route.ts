import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { direction, telescopeId } = body

    // Convert direction to angle based on requirements
    const directionToAngle: Record<string, number> = {
      north: 90,
      south: 270,
      east: 0,
      west: 180,
    }

    if (direction === 'stop') {
      // Handle stop command
      const movePayload = {
        angle: 0,
        level: 1,
        dur_sec: 3,
        percent: 0,
      }
      const response = await fetch(`${BACKEND_URL}/api/telescopes/${telescopeId}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(movePayload),
      })

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status}`)
      }

      return NextResponse.json({ success: true, action: 'stop' })
    }

    const angle = directionToAngle[direction.toLowerCase()]
    if (angle === undefined) {
      return NextResponse.json(
        { error: `Invalid direction: ${direction}` },
        { status: 400 }
      )
    }

    // Call backend API with specified parameters
    const movePayload = {
      angle,
      level: 1,
      dur_sec: 3,
      percent: 100,
    }

    const response = await fetch(`${BACKEND_URL}/api/telescopes/${telescopeId}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(movePayload),
    })

    if (!response.ok) {
      throw new Error(`Backend request failed: ${response.status}`)
    }

    const result = await response.json()
    return NextResponse.json(result)

  } catch (error) {
    console.error('Error in telescope move API:', error)
    return NextResponse.json(
      { error: 'Failed to move telescope' },
      { status: 500 }
    )
  }
}
