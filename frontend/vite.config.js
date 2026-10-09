import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The proxy keeps API, uploads and websockets on the same origin as the app,
// so the httpOnly session cookie works everywhere without CORS gymnastics.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
})
