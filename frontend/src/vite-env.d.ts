/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the backend, e.g. https://api.example.org; empty for the same origin. */
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
