import { useStats } from '../hooks/useStats'
import ProcessTable from '../components/ProcessTable'

export default function SystemPage() {
  const { data, isLoading } = useStats()

  const procs = data?.processes ?? []
  const live = procs.filter((p) => p.status !== 'exited')
  const hanging = procs.filter((p) => p.status === 'hanging').length
  const childRss = live.reduce((sum, p) => sum + (p.rssBytes ?? 0), 0)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">System</h1>

      {/* ── Aggregate cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="ffmpeg processes" value={String(live.length)} />
        <Metric label="Child RSS" value={`${Math.round(childRss / 1048576)} MB`} />
        <Metric label="Hanging" value={String(hanging)} alert={hanging > 0} />
        <Metric
          label="Node RSS"
          value={data?.memory ? `${Math.round(data.memory.main.rss / 1048576)} MB` : '—'}
        />
      </div>

      {/* ── Process table ──────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
          <h2 className="text-sm font-medium text-zinc-400">Tracked Processes</h2>
          <span className="text-xs text-zinc-600">
            The reaper observes only — it never kills a process
          </span>
        </div>
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-600">Loading...</div>
        ) : (
          <ProcessTable processes={procs} />
        )}
      </div>

      {/* ── Node memory ────────────────────────────────────── */}
      {data?.memory && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80">
          <div className="border-b border-zinc-800/60 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-400">Node Memory</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-3">
            <MemRow label="Process RSS" bytes={data.memory.main.rss} />
            <MemRow label="App heap" bytes={data.memory.main.heapUsed} />
            <MemRow label="Worker heap" bytes={data.memory.worker.heapUsed} />
            <MemRow label="Audio buffers" bytes={data.memory.main.arrayBuffers} />
            <MemRow label="External" bytes={data.memory.main.external} />
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${alert ? 'text-red-400' : ''}`}>
        {value}
      </p>
    </div>
  )
}

function MemRow({ label, bytes }: { label: string; bytes: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-300">{Math.round(bytes / 1048576)} MB</span>
    </div>
  )
}
