import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward every /api/* request to the Express backend.
      // This eliminates CORS issues during development and means the
      // frontend never hard-codes http://localhost:3000.
      '/api': {
        target:       'http://localhost:3000',
        changeOrigin: true,

        // ── Cookie forwarding ─────────────────────────────────────────────
        // Without this, the Vite proxy strips Set-Cookie headers and the
        // browser never receives the HttpOnly JWT cookie after login.
        //
        // configure: gives us access to the underlying http-proxy instance
        // so we can intercept and rewrite the Set-Cookie domain/path.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const setCookie = proxyRes.headers['set-cookie'];
            if (setCookie) {
              // Rewrite the cookie so it applies to localhost (the Vite origin)
              // rather than the Express origin. This makes the browser store
              // and re-send the HttpOnly cookie on subsequent /api/* calls.
              proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
                cookie
                  .replace(/; domain=[^;]*/i, '')   // strip explicit domain
                  .replace(/; secure/gi, '')          // allow http in dev
              );
            }
          });
        },
      },
    },
  },
})
