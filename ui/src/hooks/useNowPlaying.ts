import { useQuery } from '@tanstack/react-query'

export type Song = {
  isSong: true
  title: string
  artist: string
  album?: string
  year?: number
  startedAt: string
}

export type Event = {
  isSong: false
  title: string
  startedAt: string
}

export type NowPlayingEntry = Song | Event

export type NowPlayingResponse = {
  current: NowPlayingEntry | null
  history: NowPlayingEntry[]
}

async function fetchNowPlaying(): Promise<NowPlayingResponse> {
  const res = await fetch('/api/now-playing')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useNowPlaying() {
  return useQuery({
    queryKey: ['now-playing'],
    queryFn: fetchNowPlaying,
    refetchInterval: 10000,
  })
}
