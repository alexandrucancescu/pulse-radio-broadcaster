import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/stats': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/listen.m3u': 'http://localhost:3000',
      '/listen.pls': 'http://localhost:3000',
      '/favicon.ico': 'http://localhost:3000',
      '/favicon-16.png': 'http://localhost:3000',
      '/favicon-32.png': 'http://localhost:3000',
      '/apple-touch-icon.png': 'http://localhost:3000',
      '/icon-192.png': 'http://localhost:3000',
      '/icon-512.png': 'http://localhost:3000',
      '/logo.png': 'http://localhost:3000',
      '/site.webmanifest': 'http://localhost:3000',
    },
  },
})
