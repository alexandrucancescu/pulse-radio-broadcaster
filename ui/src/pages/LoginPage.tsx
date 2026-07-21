import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setAuth } from '../lib/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const res = await fetch('/api/config', {
        headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` },
      })

      if (res.status === 401) {
        setError('Wrong username or password')
        return
      }
      if (!res.ok) {
        setError(`Server error (HTTP ${res.status})`)
        return
      }

      setAuth(user, pass)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950">
      {/* Aurora background: blurred radio-dial glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full bg-red-900/30 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-violet-900/25 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-48 left-1/4 h-[30rem] w-[30rem] rounded-full bg-rose-950/40 blur-[130px]" />

      {/* Faint equalizer bars along the bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-40 items-end justify-center gap-1.5 opacity-10">
        {Array.from({ length: 48 }, (_, i) => (
          <div
            key={i}
            className="eq-bar w-2 rounded-t bg-red-400"
            style={{
              height: `${25 + ((i * 37) % 70)}%`,
              animationDelay: `${(i * 137) % 900}ms`,
              animationDuration: `${900 + ((i * 211) % 700)}ms`,
            }}
          />
        ))}
      </div>

      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-zinc-100">Pulse Radio</h1>
          <p className="text-sm text-zinc-500">Sign in to the admin panel</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            autoFocus
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500"
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !user || !pass}
          className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
