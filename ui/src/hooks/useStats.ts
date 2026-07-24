import { useQuery } from '@tanstack/react-query'
import { authFetch } from '../lib/auth'

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
  // Which source is on air: 'rtp' | 'autodj' | 'silence' | null
  onAir: string | null
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

export type StreamBuffers = {
  totalBytes: number
  budgetBytes: number
  // null when the budget is disabled (STREAM_TOTAL_BUFFER_MB=0)
  percentOfBudget: number | null
}

export type ProcStatus = 'running' | 'hanging' | 'exited'

// One spawned ffmpeg the Patient Reaper is following (src/system/PatientReaper.ts)
export type TrackedProcess = {
  id: number
  pid: number
  role: string
  label: string
  startedAt: number
  status: ProcStatus
  released: boolean
  exitedAt: number | null
  exitCode: number | null
  cpuPct: number | null
  rssBytes: number | null
}

export type StatsResponse = {
  streamBuffers: StreamBuffers
  listenerCount: number
  uniqueIpCount: number
  listenersByReferer: Record<string, number>
  listenersByCountry: Record<string, number>
  listeners: Listener[]
  uptime: Uptime
  processes: TrackedProcess[]
  memory: {
    main: MemoryUsage
    worker: MemoryUsage
  }
}

async function fetchStats(): Promise<StatsResponse> {
  const res = await authFetch('/api/stats')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    // Live dashboard: refresh often enough that process CPU/RSS and listener
    // counts stay current (the reaper samples every ~3s server-side).
    refetchInterval: 5000,
  })
}
