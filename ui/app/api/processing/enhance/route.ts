import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60 // 60 seconds timeout for processing

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image_url, settings } = body

    if (!image_url || !settings) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Forward to Python backend for enhancement processing
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const backendResponse = await fetch(`${backendUrl}/api/processing/enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_url: image_url,
        settings: {
          upscaling_enabled: settings.upscaling_enabled,
          scale_factor: settings.scale_factor,
          upscaling_method: settings.upscaling_method,
          sharpening_enabled: settings.sharpening_enabled,
          sharpening_method: settings.sharpening_method,
          sharpening_strength: settings.sharpening_strength,
          denoise_enabled: settings.denoise_enabled,
          denoise_method: settings.denoise_method,
          denoise_strength: settings.denoise_strength,
          deconvolve_enabled: settings.deconvolve_enabled,
          deconvolve_strength: settings.deconvolve_strength,
          deconvolve_psf_size: settings.deconvolve_psf_size,
          stretch_parameter: settings.stretch_parameter
        }
      })
    })

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      console.error('Backend enhancement error:', errorText)
      return NextResponse.json(
        { error: 'Failed to enhance image' },
        { status: 500 }
      )
    }

    const result = await backendResponse.json()

    return NextResponse.json({
      success: true,
      enhanced_image_url: result.enhanced_image_url,
      processing_time: result.processing_time
    })

  } catch (error) {
    console.error('Enhancement error:', error)
    return NextResponse.json(
      { error: 'Failed to process enhancement request' },
      { status: 500 }
    )
  }
}