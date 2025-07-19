import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 60 // 60 seconds timeout for large file uploads

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file extension
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.fits') && !fileName.endsWith('.fit')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a FITS file.' },
        { status: 400 }
      )
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    // Generate unique filename
    const uniqueId = uuidv4()
    const extension = path.extname(file.name)
    const uniqueFileName = `${uniqueId}${extension}`
    const filePath = path.join(uploadsDir, uniqueFileName)

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Forward to Python backend for FITS processing
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const backendFormData = new FormData()
    backendFormData.append('file', new Blob([buffer], { type: 'application/octet-stream' }), file.name)

    const backendResponse = await fetch(`${backendUrl}/api/processing/fits-to-image`, {
      method: 'POST',
      body: backendFormData
    })

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      console.error('Backend processing error:', errorText)
      return NextResponse.json(
        { error: 'Failed to process FITS file' },
        { status: 500 }
      )
    }

    const result = await backendResponse.json()

    // Return the processed image URL and metadata
    return NextResponse.json({
      success: true,
      imageUrl: result.image_url,
      dimensions: result.dimensions,
      metadata: result.metadata,
      fileName: file.name,
      fileSize: file.size
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload and process file' },
      { status: 500 }
    )
  }
}