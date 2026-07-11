import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    // PWA shell (WP-154/155). The service worker precaches the APP SHELL
    // ONLY — JS/CSS/HTML/fonts/icons. Song data is owned by the IndexedDB
    // local library (WP-109); caching API/Firestore responses here would be
    // a second, diverging copy (Decision Log).
    VitePWA({
      // 'prompt': a new deploy surfaces an in-app "refresh to update" toast;
      // never a silent reload — that would tear down a live worship session.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/og-default.png'],
      manifest: {
        name: 'Laudasist',
        short_name: 'Laudasist',
        description: 'Worship songs, live sessions, chords & lyrics',
        lang: 'en',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#4f46e5',
        background_color: '#111827',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // SPA offline boot: navigations fall back to the cached shell —
        // but never API/relay paths.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io/, /^\/health/],
        // No runtimeCaching on purpose: the shell is the SW's whole job.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@laudasist/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
})
