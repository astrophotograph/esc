import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(request: NextRequest, { params }: { params: { file_id: string } }) {
  try {
    const { file_id } = params

    // Forward request to Python backend
    const response = await fetch(`http://localhost:8000/api/processing/persisted-files/${file_id}`, {
      method: 'DELETE',
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
    console.error('Failed to delete persisted file:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete persisted file' },
      { status: 500 }
    )
  }
}