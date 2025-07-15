import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ra = searchParams.get('ra');
    const dec = searchParams.get('dec');
    const width = searchParams.get('width') || '800';
    const height = searchParams.get('height') || '600';

    // Validate required parameters
    if (!ra || !dec) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: ra and dec' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use backend URL to proxy to Python server
    const backendBaseUrl = process.env.BACKEND_URL || process.env.LOCAL_API || 'http://localhost:8000';
    const starmapUrl = `${backendBaseUrl}/api/starmap?ra=${ra}&dec=${dec}&width=${width}&height=${height}`;

    console.log(`Proxying starmap request: ${starmapUrl}`);

    const response = await fetch(starmapUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      console.error(`Starmap API error: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch starmap from backend' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Return the starmap data as JSON
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error proxying starmap request:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to proxy starmap request' }),
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
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}