import { NextRequest } from 'next/server';
import { createSafeTransformStream, checkMemoryPressure } from '@/lib/stream-utils';
import { getConnectionPool } from '@/lib/connection-pool';
import {getBackendUrl} from '@/lib/backend-config'

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30; // 30 second max for Vercel

export async function GET(req: NextRequest,
                          { params }: { params: Promise<{ scope: string }> }
                          ) {
  let abortController: AbortController | undefined;
  const connectionId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const pool = getConnectionPool();
  
  // Check if we can accept new connections
  if (!pool.canAccept()) {
    console.error('Connection pool full, rejecting SSE request');
    return new Response(
      JSON.stringify({ error: 'Server at maximum capacity, please try again later' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '10' } }
    );
  }
  
  try {
    const { scope } = await params;
    
    // Add to connection pool
    if (!pool.add(connectionId, 'sse', scope)) {
      return new Response(
        JSON.stringify({ error: 'Unable to establish connection' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Use direct backend URL to avoid circular proxy calls
    const backendBaseUrl = process.env.BACKEND_URL || getBackendUrl();
    const statusStreamUrl = `${backendBaseUrl}/api/telescopes/${scope}/status/stream`;

    console.log(`Proxying SSE status stream for ${scope}: ${statusStreamUrl}`);

    // Create an abort controller for cleanup
    abortController = new AbortController();
    
    const response = await fetch(statusStreamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      signal: abortController.signal,
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

    // Check memory pressure before creating stream
    checkMemoryPressure();
    
    // Create a safe transform stream with limits
    const { transformer, abort } = createSafeTransformStream({
      maxSize: 50 * 1024 * 1024, // 50MB max for SSE streams
      timeout: 30000, // 30 second timeout
      chunkSize: 4 * 1024, // 4KB chunks for SSE
    });
    
    const reader = response.body.getReader();
    const writer = transformer.writable.getWriter();
    
    // Pipe the response with cleanup handling
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.ready; // Backpressure handling
          await writer.write(value);
        }
      } catch (error) {
        console.error('SSE stream error:', error);
      } finally {
        abort(); // Ensure transform stream is aborted
        try {
          await reader.cancel();
          await writer.close();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
    
    pump().catch(console.error);

    // Clean up on client disconnect
    req.signal.addEventListener('abort', () => {
      console.log(`Client disconnected from SSE stream for ${scope}`);
      pool.remove(connectionId);
      abortController?.abort();
      abort();
      reader.cancel().catch(() => {});
      writer.close().catch(() => {});
    });

    // Create a new response with the transform stream and proper SSE headers
    return new Response(transformer.readable, {
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
    pool.remove(connectionId);
    abortController?.abort();
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