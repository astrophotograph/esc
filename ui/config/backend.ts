// Backend configuration
export const getBackendUrl = () => {
  // Use environment variable if available, otherwise use default
  if (process.env.BACKEND_HOST) {
    return `http://${process.env.BACKEND_HOST}`;
  }
  
  // Use port 8000 for development, 8100 for production
  const defaultPort = process.env.NODE_ENV === 'development' ? '8000' : '8100';
  return `http://localhost:${defaultPort}`;
};

export const BACKEND_URL = getBackendUrl();