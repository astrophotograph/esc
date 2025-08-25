import { NextRequest, NextResponse } from 'next/server'
import {getBackendUrl} from '@/lib/backend-config'

export async function GET(_request: NextRequest) {
  try {
    // Forward request to Python backend
    const backendUrl = process.env.BACKEND_URL || getBackendUrl()
    const response = await fetch(`${backendUrl}/api/processing/persisted-files`, {
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