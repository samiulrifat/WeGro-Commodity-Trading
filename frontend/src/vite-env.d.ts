/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API; '/api' (same origin, proxied in development) by default. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
