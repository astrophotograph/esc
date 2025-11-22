import { http, HttpResponse } from 'msw'
import { mockTelescope } from './index'

// Base URL for API
const API_BASE = 'http://localhost:8000'

// Mock API handlers
export const handlers = [
  // Telescope discovery endpoint
  http.get(`${API_BASE}/api/v2/telescopes`, () => {
    return HttpResponse.json({
      telescopes: [
        mockTelescope(),
        mockTelescope({
          id: 'test-telescope-2',
          name: 'Test Telescope 2',
          host: '192.168.1.101',
          status: 'offline',
          connected: false,
        }),
      ],
    })
  }),

  // Telescope focus control
  http.post(`${API_BASE}/api/v2/telescopes/focus`, async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      success: true,
      position: body.position,
    })
  }),

  // Telescope focus increment
  http.post(`${API_BASE}/api/v2/telescopes/focus-inc`, async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      success: true,
      increment: body.increment,
    })
  }),

  // Telescope movement
  http.post(`${API_BASE}/api/v2/telescopes/move`, async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      success: true,
      ra: body.ra,
      dec: body.dec,
    })
  }),

  // Telescope park
  http.post(`${API_BASE}/api/v2/telescopes/park`, () => {
    return HttpResponse.json({
      success: true,
      message: 'Telescope parked',
    })
  }),

  // Health check
  http.get(`${API_BASE}/api/health`, () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    })
  }),
]

// Error response handlers for testing error states
export const errorHandlers = {
  telescopeDiscoveryError: http.get(`${API_BASE}/api/v2/telescopes`, () => {
    return HttpResponse.json(
      { error: 'Failed to discover telescopes' },
      { status: 500 }
    )
  }),

  telescopeTimeout: http.get(`${API_BASE}/api/v2/telescopes`, async () => {
    await new Promise(resolve => setTimeout(resolve, 5000))
    return HttpResponse.json({ telescopes: [] })
  }),

  networkError: http.get(`${API_BASE}/api/v2/telescopes`, () => {
    return HttpResponse.error()
  }),
}

// SSE mock helper
export const createSSEMock = (telescopeId: string) => {
  return http.get(`${API_BASE}/api/${telescopeId}/status/stream`, () => {
    const stream = new ReadableStream({
      start(controller) {
        // Send initial status
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: 'status',
              telescope_id: telescopeId,
              connected: true,
              tracking: false,
              imaging: false,
              focus_position: 0,
            })}\n\n`
          )
        )

        // Send periodic updates
        const interval = setInterval(() => {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                type: 'stats',
                telescope_id: telescopeId,
                disk_usage: Math.random() * 100,
                free_mb: 1000 + Math.random() * 1000,
                total_mb: 2000,
              })}\n\n`
            )
          )
        }, 1000)

        // Cleanup on close
        return () => {
          clearInterval(interval)
        }
      },
    })

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  })
}