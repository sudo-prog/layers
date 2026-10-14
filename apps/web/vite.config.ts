import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3000,
    host: "127.0.0.1",
    // Security headers for production preview. In dev mode, CSP blocks Vite HMR eval,
    // so CSP is applied at the hosting/CDN level instead. See docs/security-review.md.
    headers: process.env.NODE_ENV === "production" ? {
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    } : undefined,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:8123",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png", "icon-512-maskable.png"],
      manifest: {
        name: "LAYERS",
        short_name: "LAYERS",
        description: "Visual Style Engine — layer-based shader composition tool",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/v1/, /^\/api/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(?:js|css)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "app-shell-assets",
              expiration: { maxEntries: 50, maxAgeSeconds: 2592000 },
            },
          },
          {
            urlPattern: /\/presets\/.*\.json$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "preset-json",
              expiration: { maxEntries: 20, maxAgeSeconds: 604800 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|gif|svg|webp|avif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 100, maxAgeSeconds: 2592000 },
            },
          },
        ],
      },
    }),
  ],
});
