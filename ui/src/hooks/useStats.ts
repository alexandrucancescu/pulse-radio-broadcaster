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
  // Unsent bytes queued for this listener; only present when the server
  // runs with STATS_DEBUG. ~0 = draining fine, climbing = stalled client
  bufferedBytes?: number
}

export type Interruption = {
  start: number
  end?: number
}

export type Uptime = {
  startedAt: number
  isUp: boolean
  uptime1h: number
  uptime24h: number
  uptime7d: number
  uptime30d: number
  interruptions: Interruption[]
}

export type MemoryUsage = {
  rss: number
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
}

export type StatsResponse = {
  listenerCount: number
  uniqueIpCount: number
  listenersByReferer: Record<string, number>
  listenersByCountry: Record<string, number>
  listeners: Listener[]
  uptime: Uptime
  memory: {
    main: MemoryUsage
    worker: MemoryUsage
  }
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
