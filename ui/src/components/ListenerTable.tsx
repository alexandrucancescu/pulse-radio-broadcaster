import type { Listener } from '../hooks/useStats'

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatBytes(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export default function ListenerTable({
  listeners,
}: {
  listeners: Listener[]
}) {
  // Only sent when the server runs with STATS_DEBUG
  const showBuffered = listeners.some((l) => l.bufferedBytes !== undefined)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400">
            <th className="px-3 py-2 font-medium">IP</th>
            <th className="px-3 py-2 font-medium">Location</th>
            <th className="px-3 py-2 font-medium">Stream</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Listening</th>
            {showBuffered && (
              <th className="px-3 py-2 font-medium">Buffered</th>
            )}
          </tr>
        </thead>
        <tbody>
          {listeners.map((l) => (
            <tr
              key={l.id}
              className="border-b border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
            >
              <td className="px-3 py-2 font-mono text-xs">{l.ip}</td>
              <td className="px-3 py-2">
                {l.geolocation
                  ? `${l.geolocation.region}, ${l.geolocation.country}`
                  : '—'}
              </td>
              <td className="px-3 py-2">
                <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs">
                  {l.streamPath}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-zinc-400">
                {l.userAgent
                  ? `${l.userAgent.family} ${l.userAgent.major}`
                  : '—'}
              </td>
              <td className="px-3 py-2 text-xs">
                {formatDuration(Date.now() - l.startTime)}
              </td>
              {showBuffered && (
                <td
                  className={`px-3 py-2 font-mono text-xs ${
                    (l.bufferedBytes ?? 0) > 262144
                      ? 'text-amber-400'
                      : 'text-zinc-400'
                  }`}
                >
                  {l.bufferedBytes !== undefined
                    ? formatBytes(l.bufferedBytes)
                    : '—'}
                </td>
              )}
            </tr>
          ))}
          {listeners.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="px-3 py-8 text-center text-zinc-500"
              >
                No listeners connected
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
