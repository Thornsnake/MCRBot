import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Express backend serves the built SPA from class/gui/public, so the build
// output is emitted directly there. In dev, /api and /socket.io are proxied to
// the running backend on port 4100.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4100',
      '/socket.io': {
        target: 'http://localhost:4100',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../class/gui/public',
    emptyOutDir: true,
  },
})
