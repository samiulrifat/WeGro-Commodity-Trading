/** Settings read at build time from VITE_ variables (see .env.example). */
export const env = {
  apiUrl: (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, ''),
} as const;
