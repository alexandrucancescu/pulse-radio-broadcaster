import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '../lib/auth'

export type PanelUser = {
  name: string
  role: 'admin' | 'staff'
  grants: string[]
  tokenVersion: number
}

export type UsersResponse = {
  users: PanelUser[]
  roles: string[]
  grants: string[]
}

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`
    throw new Error(message)
  }
  return body
}

export function useUsers() {
  return useQuery<UsersResponse>({
    queryKey: ['users'],
    queryFn: async () => jsonOrThrow(await authFetch('/api/users')),
  })
}

function useUserMutation<Vars>(fn: (vars: Vars) => Promise<Response>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: Vars) => jsonOrThrow(await fn(vars)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useCreateUser() {
  return useUserMutation(
    (user: { name: string; password: string; role: string; grants: string[] }) =>
      authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      }),
  )
}

export function useUpdateUser() {
  return useUserMutation(
    ({ name, ...patch }: { name: string; password?: string; role?: string; grants?: string[] }) =>
      authFetch(`/api/users/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
  )
}

export function useDeleteUser() {
  return useUserMutation((name: string) =>
    authFetch(`/api/users/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  )
}
