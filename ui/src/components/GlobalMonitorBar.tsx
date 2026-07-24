import { useEffect, useState } from 'react'
import AudioMeter from './AudioMeter'
import { usePreferredStream } from '../hooks/usePreferredStream'

// Persistent audio monitor pinned to the bottom of the dashboard. It lives in
// AdminLayout (above the router outlet), so it never unmounts on page changes —
// once enabled, the gauge/audio keeps running across the whole panel. It stays
// dead until the user explicitly clicks to enable it (no auto-run, no surprise
// bandwidth or sound).

// Attention hint: pulse for a few seconds on load to get noticed, but back off
// once the user has clearly seen it a few times (or enabled it once).
const HINT_KEY = 'pulseMonitorHint'
const HINT_MAX = 3 // stop nagging after this many load-time hints
const HINT_MS = 6500 // how long the pulse runs per load
const MUTE_MS = 7 * 24 * 60 * 60 * 1000 // quiet window once the max is reached
const DISCOVERED_MS = 30 * 24 * 60 * 60 * 1000 // longer quiet once they've used it

type HintState = { count: number; mutedUntil: number }

function readHint(): HintState {
  try {
    const raw = localStorage.getItem(HINT_KEY)
    if (raw) return JSON.parse(raw) as HintState
  } catch {
    /* ignore */
  }
  return { count: 0, mutedUntil: 0 }
}

function writeHint(state: HintState) {
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export default function GlobalMonitorBar() {
  const stream = usePreferredStream()
  const [hint, setHint] = useState(false)

  // Decide once per session whether to draw attention.
  useEffect(() => {
    const now = Date.now()
    const st = readHint()

    // Inside an active quiet window — stay silent.
    if (st.count >= HINT_MAX && now < st.mutedUntil) return
    // Quiet window elapsed — allow the occasional re-reminder.
    const count = st.count >= HINT_MAX ? 0 : st.count

    setHint(true)
    const timer = setTimeout(() => setHint(false), HINT_MS)

    const next = count + 1
    writeHint({ count: next, mutedUntil: next >= HINT_MAX ? now + MUTE_MS : 0 })

    return () => clearTimeout(timer)
  }, [])

  // Once they enable it, they clearly know it's there — go quiet for a while.
  function onActivate() {
    setHint(false)
    writeHint({ count: HINT_MAX, mutedUntil: Date.now() + DISCOVERED_MS })
  }

  return (
    <div className="fixed bottom-0 left-56 right-0 z-30 border-t border-zinc-800 bg-zinc-900/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto max-w-7xl">
        {stream ? (
          // Remount on stream change so a vanished/re-picked stream resets cleanly.
          <AudioMeter key={stream.url} src={stream.url} label={stream.label} attention={hint} onActivate={onActivate} />
        ) : (
          <div className="flex items-center gap-3 py-2 text-sm text-zinc-600">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-800/60">
              <span className="h-2 w-2 rounded-full bg-zinc-600" />
            </span>
            No active stream to monitor
          </div>
        )}
      </div>
    </div>
  )
}
