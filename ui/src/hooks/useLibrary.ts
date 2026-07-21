import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '../lib/auth'

export type MediaType = 'song' | 'jingle'

export type MediaFile = {
  name: string
  type: MediaType
  sizeBytes: number
  modifiedAt: number
}

async function fetchLibrary(): Promise<{ files: MediaFile[] }> {
  const res = await authFetch('/api/library')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useLibrary() {
  return useQuery({
    queryKey: ['library'],
    queryFn: fetchLibrary,
    refetchOnWindowFocus: false,
  })
}

export async function uploadFile(file: File, type: MediaType) {
  const form = new FormData()
  form.append('file', file)

  const res = await authFetch(`/api/library/upload?type=${type}`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const body = (await res.json()) as {
    saved: string[]
    failed: { name: string; error: string }[]
  }
  if (body.failed.length > 0) throw new Error(body.failed[0].error)
}

export function useSetType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { name: string; from: MediaType; to: MediaType }) => {
      const res = await authFetch('/api/library/set-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}

export function useDeleteFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { name: string; type: MediaType }) => {
      const res = await authFetch('/api/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  })
}
