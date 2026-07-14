import type { Listener } from '../hooks/useStats'

export default function CountryBreakdown({
  listeners,
}: {
  listeners: Listener[]
}) {
  const counts: Record<string, number> = {}
  for (const l of listeners) {
    const country = l.geolocation?.country ?? 'Unknown'
    counts[country] = (counts[country] ?? 0) + 1
  }

  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a)
  const total = listeners.length

  if (entries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-zinc-500">
        No listener data
      </div>
    )
  }

  return (
    <div className="space-y-2 p-4">
      {entries.map(([country, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0
        return (
          <div key={country} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{country}</span>
              <span className="text-zinc-400">
                {count} <span className="text-xs">({pct.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-emerald-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
