import { NextRequest, NextResponse } from 'next/server';
import {fetchTelescopes} from "@/lib/telescopes"

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    // Get backend server URL from environment or use default
    const telescopes = await fetchTelescopes()

    // if (!response.ok) {
    //   console.error(`Backend telescope API error: ${response.status} ${response.statusText}`);
    //
    //   // Return empty array if backend is not available
    //   return NextResponse.json([], { status: 200 });
    // }

    // const telescopes = await response.json();
    console.log(`Retrieved ${telescopes.length} telescopes from backend`);

    return NextResponse.json(telescopes);

  } catch (error) {
    console.error('Error fetching telescopes from backend:', error);

    // Return empty array on error so frontend can fall back to sample data
    return NextResponse.json([], { status: 200 });
  }
}
