import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '../lib/auth'

export type EqBandType = 'peaking' | 'lowshelf' | 'highshelf'

export type EqBand = {
  type: EqBandType
  frequency: number
  gainDb: number
  q: number
}

export type EqParams = {
  enabled: boolean
  preampDb: number
  bands: EqBand[]
}

export type DynamicsPreset = 'clean' | 'warm' | 'punchy' | 'loud'

export type DynamicsParams = {
  enabled: boolean
  preset: DynamicsPreset
  targetLufs: number
  drive: number
  ceilingDb: number
}

export type DspSettings = {
  eq: EqParams
  dynamics: DynamicsParams
}

// Edits land on the preview chain (heard on /monitor.wav); live only
// changes through an explicit commit.
export type DspResponse = {
  live: DspSettings
  preview: DspSettings
  monitorToken?: string
}

async function fetchDsp(): Promise<DspResponse> {
  const res = await authFetch('/api/dsp')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function send(path: string, method: string, body?: unknown) {
  const res = await authFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useDsp() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['dsp'],
    queryFn: fetchDsp,
    // No polling: this page owns the state while the user drags sliders
    refetchInterval: false,
    refetchOnWindowFocus: false,
  })

  const setPreview = (preview: DspSettings) =>
    queryClient.setQueryData(['dsp'], (old: DspResponse | undefined) =>
      old ? { ...old, preview } : old,
    )

  const setBoth = (data: { live: DspSettings; preview: DspSettings }) =>
    queryClient.setQueryData(['dsp'], (old: DspResponse | undefined) =>
      old ? { ...old, ...data } : old,
    )

  const eqMutation = useMutation({
    mutationFn: (params: EqParams): Promise<DspSettings> =>
      send('/api/dsp/eq', 'PATCH', params),
    onSuccess: setPreview,
  })

  const dynamicsMutation = useMutation({
    mutationFn: (params: DynamicsParams): Promise<DspSettings> =>
      send('/api/dsp/dynamics', 'PATCH', params),
    onSuccess: setPreview,
  })

  const commitMutation = useMutation({
    mutationFn: (): Promise<{ live: DspSettings; preview: DspSettings }> =>
      send('/api/dsp/commit', 'POST'),
    onSuccess: setBoth,
  })

  const resetMutation = useMutation({
    mutationFn: (): Promise<{ live: DspSettings; preview: DspSettings }> =>
      send('/api/dsp/reset', 'POST'),
    onSuccess: setBoth,
  })

  return { query, eqMutation, dynamicsMutation, commitMutation, resetMutation }
}
