import type { ProcStatus, TrackedProcess } from '../hooks/useStats'

const STATUS: Record<ProcStatus, { label: string; dot: string; text: string }> = {
  running: { label: 'Running', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  hanging: { label: 'Hanging', dot: 'bg-red-500 animate-pulse', text: 'text-red-400' },
  exited: { label: 'Exited', dot: 'bg-zinc-600', text: 'text-zinc-500' },
}

const ROLE_LABELS: Record<string, string> = {
  'icecast-encoder': 'Icecast encoder',
  'hls-encoder': 'HLS encoder',
  'autodj-decode': 'AutoDJ decode',
  encoder: 'Encoder',
}

function fmtRss(bytes: number | null): string {
  if (bytes === null) return '—'
  return `${Math.round(bytes / 1048576)} MB`
}

function fmtCpu(pct: number | null): string {
  if (pct === null) return '—'
  return `${pct.toFixed(1)}%`
}

function fmtUptime(startedAt: number, exitedAt: number | null): string {
  const ms = (exitedAt ?? Date.now()) - startedAt
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export default function ProcessTable({ processes }: { processes: TrackedProcess[] }) {
  if (processes.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-600">No processes tracked</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Label</th>
            <th className="px-4 py-2 font-medium text-right">PID</th>
            <th className="px-4 py-2 font-medium text-right">CPU</th>
            <th className="px-4 py-2 font-medium text-right">RSS</th>
            <th className="px-4 py-2 font-medium text-right">Uptime</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p) => {
            const st = STATUS[p.status]
            return (
              <tr key={p.id} className="border-b border-zinc-800/50 last:border-0">
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-1.5 ${st.text}`}>
                    <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-300">{ROLE_LABELS[p.role] ?? p.role}</td>
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-zinc-400">{p.label}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono text-zinc-500">{p.pid || '—'}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-300 tabular-nums">{fmtCpu(p.cpuPct)}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-300 tabular-nums">{fmtRss(p.rssBytes)}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-500 tabular-nums">
                  {fmtUptime(p.startedAt, p.exitedAt)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
