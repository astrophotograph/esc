import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const response = await fetch('http://localhost:8000/status/stream', {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to connect to status stream' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if the response is a readable stream
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'No response body' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a new response with the same body
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error proxying status stream:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to proxy status stream' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
