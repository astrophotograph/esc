import { NextRequest } from 'next/server';
import { getBackendBaseUrl } from '../../../../../lib/telescopes';

export async function GET(request: NextRequest) {
  const backendUrl = getBackendBaseUrl();
  const targetUrl = `${backendUrl}/api/webrtc/test/video-stream`;
  
  console.log('Proxying test video stream request to:', targetUrl);
  
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'multipart/x-mixed-replace',
      },
    });
    
    if (!response.ok) {
      console.error('Backend test video stream error:', response.status, response.statusText);
      return new Response(`Backend error: ${response.status}`, { 
        status: response.status 
      });
    }
    
    // Stream the MJPEG response directly to the client
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error proxying test video stream:', error);
    return new Response('Proxy error', { status: 500 });
  }
}