// Session handling for the admin panel. The server sets an HttpOnly
// session cookie on login — JS never sees or stores credentials; we
// just make same-origin requests and react to 401s.

export type Me = {
  name: string
  role: 'admin' | 'staff'
  grants: string[]
}

export async function login(username: string, password: string): Promise<Me> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (res.status === 401) throw new Error('Wrong username or password')
  if (!res.ok) throw new Error(`Server error (HTTP ${res.status})`)

  return res.json()
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

/** Throws when not logged in — AdminLayout redirects on that */
export async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/auth/me')
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

export async function authFetch(
  input: RequestInfo,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(input, init)

  // Session expired or revoked mid-use — back to login
  if (res.status === 401) {
    window.location.href = '/login'
  }

  return res
}
