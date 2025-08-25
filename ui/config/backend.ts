// Backend configuration
export const getBackendUrl = () => {
  // Use environment variable if available, otherwise use default
  const backendHost = process.env.BACKEND_HOST || 'localhost:8100';
  return `http://${backendHost}`;
};

export const BACKEND_URL = getBackendUrl();