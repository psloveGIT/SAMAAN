import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [
          'favicon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'assets/aistudio/______________8a639368.png',
          'assets/aistudio/______________16d5c0f7.png',
          'assets/aistudio/______________5185c558.png',
        ],
        manifest: {
          id: './',
          name: 'SAMAAN - سامانه مدیریت انبارهای نیروگاهی',
          short_name: 'SAMAAN',
          description: 'سمان - سامانه مدیریت انبارهای نیروگاهی | Power Plant Warehouse Management System',
          lang: 'fa',
          dir: 'rtl',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          start_url: './',
          scope: './',
          prefer_related_applications: false,
          categories: ['business', 'productivity', 'utilities'],
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          skipWaiting: false,
          clientsClaim: false,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globIgnores: ['**/app-version.json'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//, /app-version\.json$/],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/xlsx/')) return 'vendor-xlsx';
              if (id.includes('/jszip/')) return 'vendor-jszip';
              if (id.includes('/lucide-react/')) return 'vendor-icons';
              if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
