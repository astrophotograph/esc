import { NextResponse } from 'next/server';
import { getServerMonitor } from '@/lib/server-monitoring';

export async function GET() {
  // Get server-side metrics
  const monitor = getServerMonitor();
  const metrics = monitor.getPrometheusMetrics();
  
  // Return metrics in Prometheus format
  return new NextResponse(metrics, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}