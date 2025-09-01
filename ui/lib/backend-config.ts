/**
 * Backend configuration utility
 * Provides a centralized way to get the backend URL
 */

// Get the backend URL from environment or use default
export function getBackendUrl(): string {
  // Always use standard port 8000 for the backend
  // Can be overridden by BACKEND_HOST environment variable
  
  if (typeof process !== 'undefined' && process.env.BACKEND_HOST) {
    return `http://${process.env.BACKEND_HOST}`;
  }
  
  // Always use port 8000 (FastAPI default)
  // Use 127.0.0.1 explicitly to avoid IPv6 issues
  return 'http://127.0.0.1:8000';
}

export const BACKEND_URL = getBackendUrl();