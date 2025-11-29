/**
 * Backend configuration utility
 * Provides a centralized way to get the backend URL
 */

// Get the backend URL from environment or use default
export function getBackendUrl(): string {
  // IMPORTANT: Always use 127.0.0.1 instead of localhost to avoid IPv6 issues
  // The backend always runs on port 8000 in the Electron app
  
  // In production Electron app, always use IPv4 loopback
  // This avoids issues where 'localhost' might resolve to ::1 (IPv6)
  return 'http://127.0.0.1:8000';
}

export const BACKEND_URL = getBackendUrl();