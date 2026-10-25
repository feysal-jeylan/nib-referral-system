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
      },
    },
  },
})
