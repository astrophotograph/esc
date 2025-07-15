import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  try {
    // Construct the file path
    const filePath = path.join(process.cwd(), 'docs', ...params.slug)
    
    // Security: prevent directory traversal
    const normalizedPath = path.normalize(filePath)
    const docsDir = path.join(process.cwd(), 'docs')
    
    if (!normalizedPath.startsWith(docsDir)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Read the file
    const content = await readFile(normalizedPath, 'utf-8')
    
    // Return the content with appropriate headers
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('Error serving documentation:', error)
    
    // Check if it's a file not found error
    if ((error as any).code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Documentation file not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}