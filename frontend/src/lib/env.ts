/** Settings read at build time from VITE_ variables (see .env.example). */
export const env = {
  /**
   * Where the backend is. Empty: the same origin as the app (proxied to the
   * backend in development). API paths already start with /api.
   */
  apiOrigin: (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/+$/, ''),
} as const;

/** The backend's origin: the configured one, or this page's. */
export const apiOrigin = (): string =>
  env.apiOrigin || globalThis.location.origin;
