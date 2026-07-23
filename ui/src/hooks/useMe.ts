import { useQuery } from '@tanstack/react-query'
import { fetchMe, type Me } from '../lib/auth'

/**
 * The logged-in user and their permissions — drives the auth guard in
 * AdminLayout and what nav items / actions the UI offers.
 */
export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

/** Can this user modify the given domain? (admin: everything) */
export function can(me: Me | undefined, domain: 'dsp' | 'autodj' | 'branding' | 'admin'): boolean {
  if (!me) return false
  if (me.role === 'admin') return true
  if (domain === 'admin') return false
  return me.grants.includes(domain)
}
