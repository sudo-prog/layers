import { defineConfig } from "vite";

/**
 * LAYERS Desktop — the full-canvas shader editor.
 *
 * Runs on 3003: 3000 is the mobile prototype, 3001 a stale dist server, and 3002
 * is occupied by an unrelated 3DDD.STUDIO dev server on this machine. The two
 * LAYERS apps are meant to be compared side by side, so they must not clash.
 */
export default defineConfig({
  server: {
    port: 3003,
    host: "127.0.0.1",
    strictPort: true,
    headers:
      process.env.NODE_ENV === "production"
        ? {
            "Content-Security-Policy":
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
          }
        : undefined,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
