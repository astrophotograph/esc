import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest) {
  try {
    // Forward request to Python backend
    const response = await fetch('http://localhost:8000/api/processing/persisted-files', {
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

  } catch (error) {
    console.error('Failed to get persisted files:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get persisted files' },
      { status: 500 }
    )
  }
}