import { useEffect, useState, useSyncExternalStore } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { logout } from '../lib/auth'
import { useMe } from '../hooks/useMe'
import { restartFlag } from '../lib/restartFlag'
import { requestRestart } from '../hooks/useConfig'
import Footer from './Footer'
import PulseLogo from './PulseLogo'
import GlobalMonitorBar from './GlobalMonitorBar'

const NAV = [
  {
    label: 'Monitoring',
    items: [
      { to: '/dashboard', label: 'Live', end: true },
      { to: '/dashboard/history', label: 'History' },
      { to: '/dashboard/system', label: 'System' },
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
  const queryClient = useQueryClient()
  const { data: me, isLoading, isError } = useMe()
  const restartRequired = useSyncExternalStore(restartFlag.subscribe, restartFlag.get)
  const [restarting, setRestarting] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)

  // Revert the confirm state if the second click never comes
  useEffect(() => {
    if (!confirmRestart) return
    const timer = setTimeout(() => setConfirmRestart(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmRestart])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
      </div>
    )
  }

  if (isError || !me) return <Navigate to="/login" replace />

  const isAdmin = me.role === 'admin'
  const nav = isAdmin
    ? [...NAV, { label: 'Administration', items: [{ to: '/dashboard/users', label: 'Users' }] }]
    : NAV

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

      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2.5 border-b border-zinc-800 px-5 py-4">
          <PulseLogo className="h-8 w-8 shrink-0 text-[#f23939]" />
          <div>
            <h1 className="text-lg font-semibold">Pulse Radio</h1>
            <p className="text-xs text-zinc-500">Admin panel</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {nav.map((group) => (
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

        <div className="space-y-2 border-t border-zinc-800 p-3">
          {isAdmin && (
            <button
              onClick={() => {
                if (!confirmRestart) {
                  setConfirmRestart(true)
                  return
                }
                setConfirmRestart(false)
                restart()
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition ${
                confirmRestart
                  ? 'bg-red-900/60 text-red-200 hover:bg-red-900'
                  : 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              <PowerIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {confirmRestart ? 'Confirm — stream will blip' : 'Restart server'}
              </span>
            </button>
          )}

          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f23939] to-red-800 text-xs font-semibold text-white">
              {initials(me.name)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-zinc-200">{me.name}</span>
              <span className="block truncate text-xs text-zinc-500 capitalize">{me.role}</span>
            </span>
          </div>

          <button
            onClick={async () => {
              await logout()
              queryClient.clear()
              navigate('/login')
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
          >
            <LogoutIcon className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {restartRequired && (
          <div className="flex items-center justify-between gap-4 border-b border-amber-900/50 bg-amber-950/40 px-6 py-2.5">
            <p className="text-sm text-amber-300">
              Saved changes need a server restart to take effect.
              {!isAdmin && ' Ask an admin to restart the server.'}
            </p>
            {isAdmin && (
              <button
                onClick={restart}
                className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-500"
              >
                Restart now
              </button>
            )}
          </div>
        )}

        <main className="flex-1 p-6 pb-28">
          <div className="mx-auto max-w-7xl space-y-6">
            <Outlet />
            <Footer />
          </div>
        </main>

        <GlobalMonitorBar />
      </div>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function PowerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

