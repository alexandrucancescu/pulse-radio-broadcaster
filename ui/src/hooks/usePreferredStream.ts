import { useMemo } from 'react'
import { useStreams, type StreamInfo } from './useStreams'
import { streamUrl } from '../lib/streamUrl'

export type PreferredStream = { url: string; label: string }

// Choose the best stream to play: skip HLS first (segmented, high latency),
// then prefer the highest bitrate, then drop anything the browser says it can't
// decode. Returns an absolute, playable URL (see streamUrl for the dev origin).
export function pickPreferredStream(streams: StreamInfo[]): PreferredStream | null {
  const active = streams.filter(s => s.active)
  const ranked = [...active].sort((a, b) => {
    if (a.type !== 'hls' && b.type === 'hls') return -1
    if (a.type === 'hls' && b.type !== 'hls') return 1
    return (b.bitrate ?? 0) - (a.bitrate ?? 0)
  })
  const probe = typeof Audio !== 'undefined' ? new Audio() : null
  for (const s of ranked) {
    if (probe && s.contentType && !probe.canPlayType(s.contentType)) continue
    return { url: streamUrl(s.paths[0]), label: `${s.format} ${s.bitrate ? s.bitrate + 'k' : ''}` }
  }
  if (ranked.length) return { url: streamUrl(ranked[0].paths[0]), label: ranked[0].format }
  return null
}

// The streams list is cached/shared by react-query (useStreams); the pick is
// memoised so the canPlayType probe doesn't run on every render.
export function usePreferredStream(): PreferredStream | null {
  const { data } = useStreams()
  return useMemo(() => (data ? pickPreferredStream(data.streams) : null), [data])
}
