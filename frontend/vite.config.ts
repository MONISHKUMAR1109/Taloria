import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev server proxies the Phase 1 API (and the uploads object store) so the
// frontend is always same-origin — which the httpOnly refresh-token cookie
// (`rt`, path /api/auth) relies on.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})