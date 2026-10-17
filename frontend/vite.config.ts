/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'node',
      setupFiles: ['src/test/setup.ts'],
    },
    server: {
      port: 5173,
      strictPort: true,
      // The browser calls /api on this server; Vite passes it to the backend,
      // so development needs no CORS and the same paths work in production.
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
