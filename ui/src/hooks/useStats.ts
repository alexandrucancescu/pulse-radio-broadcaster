import { useQuery } from '@tanstack/react-query'

export type Listener = {
  id: number
  ip: string
  geolocation?: {
    country: string
    region: string
  }
  referer?: string
  userAgent?: {
    family: string
    major: string
  }
  startTime: number
  streamPath: string
}

export type StatsResponse = {
  listenerCount: number
  listenersByReferer: Record<string, number>
  listeners: Listener[]
}

async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch('/stats')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  })
}
