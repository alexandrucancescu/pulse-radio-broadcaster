import type { Listener } from '../hooks/useStats'

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function ListenerTable({
  listeners,
}: {
  listeners: Listener[]
}) {
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
