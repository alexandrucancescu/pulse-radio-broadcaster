import { useQuery } from '@tanstack/react-query'
import { authFetch } from '../lib/auth'

export type Range = '24h' | '7d' | '30d'

export type HistoryData = {
  range: Range
  listenersOverTime: { t: string; count: number }[]
  listenersByHour: { hour: number; avg: number }[]
  topCountries: { country: string; count: number }[]
  topReferers: { referer: string; count: number }[]
  topIps: { ip: string; totalSeconds: number; sessions: number }[]
  summary: { today: number; week: number; month: number; avgDurationS: number }
  peakConcurrent: { peak: number; at: string } | null
}

async function fetchHistory(range: Range): Promise<HistoryData> {
  const res = await authFetch(`/api/history?range=${range}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useHistory(range: Range) {
  return useQuery({
    queryKey: ['history', range],
    queryFn: () => fetchHistory(range),
    refetchInterval: 60_000,
  })
}
