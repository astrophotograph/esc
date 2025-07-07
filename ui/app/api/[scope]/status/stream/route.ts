import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest,
                          { params }: { params: Promise<{ scope: string }> }
                          ) {
  try {
    const { scope } = await params;
    // Use direct backend URL to avoid circular proxy calls
    const backendBaseUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const statusStreamUrl = `${backendBaseUrl}/api/telescopes/${scope}/status/stream`;

    console.log(`Proxying SSE status stream for ${scope}: ${statusStreamUrl}`);

    const response = await fetch(statusStreamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    if (!response.ok) {
      console.error(`SSE status stream error for ${scope}: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ error: 'Failed to connect to status stream' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if the response is a readable stream
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'No response body from status stream' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a new response with the same body and proper SSE headers
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
        'X-Accel-Buffering': 'no', // Disable nginx buffering for SSE
      },
    });
  } catch (error) {
    console.error('Error proxying SSE status stream:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to proxy status stream' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// OPTIONS handler for CORS preflight requests
export async function OPTIONS(_req: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}