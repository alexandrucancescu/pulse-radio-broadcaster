import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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

async function fetchDsp(): Promise<DspSettings> {
  const res = await fetch('/api/dsp')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function patchDsp(path: string, body: unknown): Promise<DspSettings> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

  const eqMutation = useMutation({
    mutationFn: (params: EqParams) => patchDsp('/api/dsp/eq', params),
    onSuccess: (data) => queryClient.setQueryData(['dsp'], data),
  })

  const dynamicsMutation = useMutation({
    mutationFn: (params: DynamicsParams) => patchDsp('/api/dsp/dynamics', params),
    onSuccess: (data) => queryClient.setQueryData(['dsp'], data),
  })

  return { query, eqMutation, dynamicsMutation }
}
