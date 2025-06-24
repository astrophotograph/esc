/**
 * Utilities for generating telescope streaming URLs
 */

export type StreamType = 'video' | 'live' | 'preview' | 'thumb' | 'allsky' | 'guide' | 'finder';

export interface TelescopeInfo {
  serial_number?: string;
  host?: string;
  name?: string;
  id?: string;
}

/**
 * Generate a streaming URL for a telescope and stream type
 * 
 * @param telescope - Telescope information object
 * @param streamType - Type of stream to access
 * @returns Relative URL for the streaming endpoint
 */
export function generateStreamingUrl(telescope: TelescopeInfo | null, streamType: StreamType = 'video'): string {
  const scope = getTelescopeScope(telescope);
  return `/api/${scope}/stream?type=${streamType}`;
}

/**
 * Extract telescope scope identifier from telescope info
 * 
 * @param telescope - Telescope information object  
 * @returns Scope identifier for API endpoints
 */
export function getTelescopeScope(telescope: TelescopeInfo | null): string {
  if (!telescope) {
    return 'localhost';
  }

  // Priority order: serial_number > host > name > id > fallback
  if (telescope.serial_number) {
    return sanitizeScope(telescope.serial_number);
  }
  
  if (telescope.host) {
    // Extract base host, handling both "host:port" and "host" formats
    const baseHost = telescope.host.includes(':') 
      ? telescope.host.split(':')[0] 
      : telescope.host;
    return sanitizeScope(baseHost);
  }
  
  if (telescope.name) {
    return sanitizeScope(telescope.name);
  }
  
  if (telescope.id) {
    return sanitizeScope(telescope.id);
  }

  return 'localhost';
}

/**
 * Sanitize a string to be safe for use as a URL scope
 * 
 * @param input - Raw string input
 * @returns Sanitized scope string
 */
function sanitizeScope(input: string): string {
  return input
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^a-zA-Z0-9._-]/g, '') // Remove invalid characters
    .toLowerCase()                   // Convert to lowercase
    .substring(0, 64)               // Limit length
    || 'localhost';                 // Fallback if empty after sanitization
}

/**
 * Available stream types with descriptions
 */
export const STREAM_TYPES = {
  video: 'Main telescope camera feed',
  live: 'Main telescope camera feed (alias for video)',
  preview: 'Preview/thumbnail images',
  thumb: 'Preview/thumbnail images (alias for preview)',
  allsky: 'All-sky camera feed',
  guide: 'Guide camera feed',
  finder: 'Finder camera feed',
} as const;

/**
 * Check if a stream type is valid
 */
export function isValidStreamType(streamType: string): streamType is StreamType {
  return streamType in STREAM_TYPES;
}