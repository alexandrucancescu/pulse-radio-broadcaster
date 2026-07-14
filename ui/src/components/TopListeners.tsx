import type { Listener } from '../hooks/useStats'

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function TopListeners({
  listeners,
}: {
  listeners: Listener[]
}) {
  const now = Date.now()
  const sorted = [...listeners]
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 10)

  if (sorted.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-zinc-500">
        No listeners connected
      </div>
    )
  }

  const maxDuration = now - sorted[0].startTime

  return (
    <div className="space-y-2 p-4">
      {sorted.map((l) => {
        const duration = now - l.startTime
        const pct = maxDuration > 0 ? (duration / maxDuration) * 100 : 0
        return (
          <div key={l.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs text-zinc-300">{l.ip}</span>
              <span className="text-zinc-400 text-xs">
                {formatDuration(duration)}
                {l.geolocation && (
                  <span className="ml-2 text-zinc-500">
                    {l.geolocation.country}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-amber-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
