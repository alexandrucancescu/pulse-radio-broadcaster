import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Single source of truth for the app version: the root package.json (bumped by
// scripts/bump-version.mjs on commit). Baked in at build time.
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
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
