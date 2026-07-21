// Credential handling for the admin panel. The server keeps its basic
// auth (env user/pass); the login page just validates once and we attach
// the Authorization header ourselves instead of the browser popup.

const KEY = 'pulse-auth'

export function getAuth(): string | null {
  return localStorage.getItem(KEY)
}

export function setAuth(user: string, pass: string) {
  localStorage.setItem(KEY, btoa(`${user}:${pass}`))
}

export function clearAuth() {
  localStorage.removeItem(KEY)
}

export async function authFetch(
  input: RequestInfo,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAuth()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Basic ${token}`)

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    clearAuth()
    window.location.href = '/login'
  }

  return res
}
