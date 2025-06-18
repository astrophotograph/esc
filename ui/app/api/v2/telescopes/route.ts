import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // Get backend server URL from environment or use default
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const telescopesUrl = `${backendUrl}/api/telescopes`;

    console.log(`Fetching telescopes from: ${telescopesUrl}`);

    const response = await fetch(telescopesUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      console.error(`Backend telescope API error: ${response.status} ${response.statusText}`);
      
      // Return empty array if backend is not available
      return NextResponse.json([], { status: 200 });
    }

    const telescopes = await response.json();
    console.log(`Retrieved ${telescopes.length} telescopes from backend`);

    return NextResponse.json(telescopes);

  } catch (error) {
    console.error('Error fetching telescopes from backend:', error);
    
    // Return empty array on error so frontend can fall back to sample data
    return NextResponse.json([], { status: 200 });
  }
}