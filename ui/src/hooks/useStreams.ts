import { useQuery } from '@tanstack/react-query'

export type StreamInfo = {
  type?: 'http' | 'hls'
  paths: string[]
  format: string
  bitrate?: number
  contentType?: string
  active: boolean
  listeners: number
}

export type StreamsResponse = {
  station: {
    name: string
    description: string
    genre: string
  }
  streams: StreamInfo[]
}

async function fetchStreams(): Promise<StreamsResponse> {
  const res = await fetch('/api/streams')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useStreams() {
  return useQuery({
    queryKey: ['streams'],
    queryFn: fetchStreams,
    refetchInterval: 10000,
  })
}
