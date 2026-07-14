import type { Uptime } from '../hooks/useStats'

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString()
}

function uptimeColor(pct: number) {
  if (pct >= 99.9) return 'text-emerald-400'
  if (pct >= 99) return 'text-emerald-300'
  if (pct >= 95) return 'text-amber-400'
  return 'text-red-400'
}

function barColor(pct: number) {
  if (pct >= 99.9) return 'bg-emerald-500'
  if (pct >= 99) return 'bg-emerald-400'
  if (pct >= 95) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function UptimePanel({ uptime }: { uptime: Uptime }) {
  const windows = [
    { label: '1h', value: uptime.uptime1h },
    { label: '24h', value: uptime.uptime24h },
    { label: '7d', value: uptime.uptime7d },
    { label: '30d', value: uptime.uptime30d },
  ]

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <div
          className={`h-2.5 w-2.5 rounded-full ${uptime.isUp ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <span className="text-sm text-zinc-300">
          {uptime.isUp ? 'Streaming' : 'Down'}
        </span>
        <span className="text-xs text-zinc-500">
          since {formatTime(uptime.startedAt)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {windows.map((w) => (
          <div key={w.label} className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">{w.label}</span>
              <span className={`text-sm font-medium ${uptimeColor(w.value)}`}>
                {w.value.toFixed(2)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800">
              <div
                className={`h-1.5 rounded-full ${barColor(w.value)}`}
                style={{ width: `${w.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {uptime.interruptions.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-zinc-500">
            Recent Interruptions
          </h3>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {[...uptime.interruptions].reverse().map((i, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded bg-zinc-800/50 px-3 py-1.5 text-xs"
              >
                <span className="text-zinc-400">{formatTime(i.start)}</span>
                <span className="text-zinc-500">
                  {i.end
                    ? `${formatDuration(i.end - i.start)}`
                    : 'ongoing'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
