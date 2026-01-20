// Configuration for API URL
// In development, VITE_API_URL is empty so we use the proxy (relative paths).
// In production, VITE_API_URL should be the full URL of the backend.
export const API_URL = import.meta.env.VITE_API_URL || '';
