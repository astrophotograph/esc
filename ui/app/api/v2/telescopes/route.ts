import { NextRequest, NextResponse } from 'next/server';
import {fetchTelescopes, addManualTelescope, removeManualTelescope} from "@/lib/telescopes"

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

export async function POST(req: NextRequest) {
  try {
    const telescope = await req.json();
    
    const result = await addManualTelescope(telescope);
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error adding manual telescope:', error);
    return NextResponse.json(
      { error: 'Failed to add telescope' }, 
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const telescopeId = searchParams.get('id');
    
    if (!telescopeId) {
      return NextResponse.json(
        { error: 'Telescope ID is required' }, 
        { status: 400 }
      );
    }
    
    await removeManualTelescope(telescopeId);
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error removing telescope:', error);
    return NextResponse.json(
      { error: 'Failed to remove telescope' }, 
      { status: 500 }
    );
  }
}
