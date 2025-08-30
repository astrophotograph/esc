/**
 * Backend configuration utility
 * Provides a centralized way to get the backend URL
 */

// Get the backend URL from environment or use default
export function getBackendUrl(): string {
  // In production Electron app, this should be 127.0.0.1:8100
  // In development, it's 127.0.0.1:8000
  // Can be overridden by BACKEND_HOST environment variable
  
  if (typeof process !== 'undefined' && process.env.BACKEND_HOST) {
    return `http://${process.env.BACKEND_HOST}`;
  }
  
  // Check if we're in development mode
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Use port 8000 for development (FastAPI default)
    return 'http://127.0.0.1:8000';
  }
  
  // Default to port 8100 which is what the Electron app uses in production
  // Use 127.0.0.1 explicitly to avoid IPv6 issues
  return 'http://127.0.0.1:8100';
}

export const BACKEND_URL = getBackendUrl();