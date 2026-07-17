import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Web routes need root-relative assets so nested SPA URLs such as
  // /oauth/consent load the same bundle. Electron still loads dist/index.html
  // over file://, so its dedicated build keeps relative asset paths.
  base: mode === 'electron' ? './' : '/',
  build: {
    // Leave CSS unminified (JS is still minified). esbuild's CSS minifier
    // collapses paired `backdrop-filter` + `-webkit-backdrop-filter` rules to
    // the -webkit- form ONLY, which silently killed every frosted-glass blur in
    // the production build on engines that support just the standard property
    // (Chromium/Electron, Firefox, Safari 18+) — while we still need the
    // -webkit- form for iOS/Safari < 18. cssTarget doesn't prevent the collapse,
    // and switching to lightningcss would aggressively downlevel the app's heavy
    // oklch()/color-mix() usage, so disabling CSS minification is the safe fix.
    cssMinify: false,
  },
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: the service worker updates itself in the background.
      // On next visit the new version activates — users never get trapped
      // on a stale cached version.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'images/**', 'sounds/**'],
      manifest: {
        name: 'Ligand',
        short_name: 'Ligand',
        description: 'Focus, habits, and goals - designed for ADHD',
        // Matches --accent in the light theme (src/index.css): oklch(0.62 0.09 245).
        theme_color: '#558cb9',
        // Keep the install surface light so iOS 26 web-app previews do not
        // synthesize a dark surround from the manifest background.
        background_color: '#f7f9fc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-fullbleed-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-fullbleed-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell (JS, CSS, HTML).
        // Sounds and images are large — cache them on first use (runtime cache)
        // rather than up-front so the install doesn't block on downloading
        // all ~20 MB of audio files.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          // Google Fonts — cache-first, long TTL
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ligand-google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ligand-gstatic-fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Scene images — cache on first access
          {
            urlPattern: /\/images\/.*\.(jpg|png|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ligand-images-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Ambient sounds — cache on first access (StaleWhileRevalidate
          // because they rarely change but are large to re-fetch)
          {
            urlPattern: /\/sounds\/.*\.(mp3|ogg|wav)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ligand-sounds-cache',
              expiration: { maxEntries: 15, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
}))
