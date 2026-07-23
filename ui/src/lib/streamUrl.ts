// Stream paths come back origin-less (e.g. "/stream.mp3"). In production the
// UI is served from the same host as the streams, so a bare path resolves
// correctly. In dev the UI runs on Vite (:5173) while the backend and its
// streams live on :3000 — prepend the backend origin so playback and the
// Web Audio meter hit the real stream. Streams send ACAO * (see
// src/util/headers.ts), so cross-origin analysis works.
export const BACKEND_ORIGIN = import.meta.env.DEV ? 'http://localhost:3000' : ''

export function streamUrl(path: string): string {
  return BACKEND_ORIGIN + path
}
