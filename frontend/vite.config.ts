/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The browser calls /api on this server; it passes it to the backend, so
  // there is no CORS and the same paths work in production.
  const proxy = {
    '/api': {
      target: env.BACKEND_URL || 'http://localhost:3000',
      changeOrigin: true,
    },
  };
  return {
    plugins: [
      // One file per page under src/routes; each page loads on its own.
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      // Installable, and opens without internet: the app's own files are
      // kept on the device. API data is not, except the catalog (no personal
      // data; farm updates need it offline). A new version waits for the
      // person to choose "Reload" (see UpdatePrompt).
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'WeGro',
          short_name: 'WeGro',
          description:
            'Fund farming projects, follow them on the field, and trade the produce.',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#045747',
          background_color: '#ffffff',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Scripts the app never shows; the browser fetches a font's
          // character sets only when a page uses them.
          globIgnores: ['**/*-{cyrillic,greek,vietnamese}-*.woff2'],
          // Any page address opens the app offline; the API never falls back.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/docs/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname === '/api/catalog',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'wegro-catalog',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 4 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'node',
      setupFiles: ['src/test/setup.ts'],
      // Page tests type and click through whole flows: more than 5 s when
      // every file runs at once on a busy machine.
      testTimeout: 15_000,
    },
    server: { port: 5173, strictPort: true, proxy },
    // `npm run preview`: the production build, offline worker included.
    preview: { port: 4173, strictPort: true, proxy },
  };
});
