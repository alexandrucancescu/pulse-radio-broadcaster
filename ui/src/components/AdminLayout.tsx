import { useState, useSyncExternalStore } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearAuth, getAuth } from '../lib/auth'
import { restartFlag } from '../lib/restartFlag'
import { requestRestart } from '../hooks/useConfig'
import Footer from './Footer'

const NAV = [
  {
    label: 'Monitoring',
    items: [
      { to: '/dashboard', label: 'Live', end: true },
      { to: '/dashboard/history', label: 'History' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/dashboard/config/station', label: 'Station' },
      { to: '/dashboard/config/inputs', label: 'Inputs' },
      { to: '/dashboard/library', label: 'AutoDJ Library' },
      { to: '/dashboard/config/streams', label: 'Output Streams' },
      { to: '/dashboard/dsp', label: 'Audio Processing' },
      { to: '/dashboard/config/server', label: 'Server Settings' },
    ],
  },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const restartRequired = useSyncExternalStore(restartFlag.subscribe, restartFlag.get)
  const [restarting, setRestarting] = useState(false)

  if (!getAuth()) return <Navigate to="/login" replace />

  async function restart() {
    setRestarting(true)
    try {
      await requestRestart()
    } catch {
      // The connection may drop mid-request as the server exits — expected
    }

    // Poll until the server is back, then reload fresh
    const deadline = Date.now() + 60_000
    const poll = async () => {
      try {
        const res = await fetch('/api/streams')
        if (res.ok) {
          window.location.reload()
          return
        }
      } catch {
        // still down
      }
      if (Date.now() < deadline) setTimeout(poll, 1000)
      else setRestarting(false)
    }
    setTimeout(poll, 1500)
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {restarting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
          <p className="text-sm text-zinc-400">Restarting the server…</p>
        </div>
      )}

      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h1 className="text-lg font-semibold">Pulse Radio</h1>
          <p className="text-xs text-zinc-500">Admin panel</p>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-[11px] font-medium tracking-wider text-zinc-600 uppercase">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-sm transition ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-800 p-3">
          <button
            onClick={() => {
              clearAuth()
              navigate('/login')
            }}
            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {restartRequired && (
          <div className="flex items-center justify-between gap-4 border-b border-amber-900/50 bg-amber-950/40 px-6 py-2.5">
            <p className="text-sm text-amber-300">
              Saved changes need a server restart to take effect.
            </p>
            <button
              onClick={restart}
              className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-500"
            >
              Restart now
            </button>
          </div>
        )}

        <main className="flex-1 p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <Outlet />
            <Footer />
          </div>
        </main>
      </div>
    </div>
  )
}
