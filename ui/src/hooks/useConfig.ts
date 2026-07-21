import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '../lib/auth'
import { restartFlag } from '../lib/restartFlag'

export type StationConfig = {
  name: string
  description: string
  genre: string
  url?: string
  public: boolean
}

export type RtpInputConfig = {
  sampleRate: number
  format: string
  allowedIps: string[]
  noDataDisconnectDelaySec: number
  reorderDepth: number
}

export type InputsConfig = {
  // Seconds a recovered higher-priority source must stay stable before
  // the manager switches back to it
  switchBackDelaySec: number
  rtp: RtpInputConfig
}

export type StreamConfig = {
  format: string
  paths: string[]
  bitrate?: number
  channels?: number
  codec?: string
  sampleRate?: number
  options?: string[]
  contentType?: string
  burstSize?: number
  headers?: Record<string, string>
  icyMetadata?: boolean
}

export type ServerConfig = {
  streamMaxBufferSeconds: number
  streamTotalBufferMb: number
  maxConnectionsPerIp: number
  blockedUserAgents: string[]
  icyMetaint: number
  statsDebug: boolean
}

export type AppConfig = {
  station: StationConfig
  inputs: InputsConfig
  streams: StreamConfig[]
  server: ServerConfig
}

export type ConfigResponse = {
  config: AppConfig
  restartSections: string[]
}

async function fetchConfig(): Promise<ConfigResponse> {
  const res = await authFetch('/api/config')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    refetchOnWindowFocus: false,
  })
}

export function useSaveSection<S extends keyof AppConfig>(section: S) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (value: AppConfig[S]) => {
      const res = await authFetch(`/api/config/${section}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          body?.error ? JSON.stringify(body.error) : `HTTP ${res.status}`,
        )
      }
      return res.json() as Promise<{ requiresRestart: boolean; config: AppConfig }>
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['config'], (old: ConfigResponse | undefined) =>
        old ? { ...old, config: data.config } : old,
      )
      if (data.requiresRestart) restartFlag.set(true)
    },
  })
}

export async function requestRestart(): Promise<void> {
  await authFetch('/api/config/restart', { method: 'POST' })
}
