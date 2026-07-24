import { Link } from 'react-router-dom'
import { useStats, type TrackedProcess } from '../hooks/useStats'
import { useNowPlaying } from '../hooks/useNowPlaying'
import ListenerTable from '../components/ListenerTable'
import RefererBreakdown from '../components/RefererBreakdown'
import CountryBreakdown from '../components/CountryBreakdown'
import TopListeners from '../components/TopListeners'
import UptimePanel from '../components/UptimePanel'
import NowPlayingBar from '../components/NowPlayingBar'

export default function LivePage() {
  const { data, isLoading, error } = useStats()
  const { data: nowPlaying } = useNowPlaying()

  const listeners = data?.listenerCount ?? 0
  const uniqueIps = data?.uniqueIpCount ?? 0
  const activeStreams = data ? new Set(data.listeners.map(l => l.streamPath)).size : 0
  const countries = data ? Object.keys(data.listenersByCountry).length : 0

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Live</h1>
        {data?.uptime && <OnAirBadge source={data.uptime.onAir} />}
      </div>

      {error && (
        <div className="rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Failed to fetch stats: {error.message}
        </div>
      )}

      {/* ── Now Playing ────────────────────────────────────── */}
      {nowPlaying?.current ? (
        <NowPlayingBar entry={nowPlaying.current} />
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-500">
          Nothing playing
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Listeners" value={isLoading ? '—' : String(listeners)} accent={listeners > 0} />
        <StatCard label="Unique IPs" value={isLoading ? '—' : String(uniqueIps)} />
        <StatCard label="Active Streams" value={isLoading ? '—' : String(activeStreams)} />
        <StatCard label="Countries" value={isLoading ? '—' : String(countries)} />
      </div>

      {/* ── Uptime + Memory ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" heading="Stream Uptime">
          {isLoading ? <Loading /> : data?.uptime ? <UptimePanel uptime={data.uptime} /> : null}
        </Card>
        <Card heading="System">
          {data?.memory ? (
            <div className="space-y-2 text-sm">
              <ProcessSummary processes={data.processes ?? []} />
              <MemRow label="Process RSS" bytes={data.memory.main.rss} />
              <MemRow label="App heap" bytes={data.memory.main.heapUsed} />
              <MemRow label="Worker heap" bytes={data.memory.worker.heapUsed} />
              <MemRow label="Audio buffers" bytes={data.memory.main.arrayBuffers} />
              {data.streamBuffers && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Listener buffers</span>
                  <span className="font-mono text-zinc-300">
                    {(data.streamBuffers.totalBytes / 1048576).toFixed(1)} MB
                    {data.streamBuffers.percentOfBudget !== null && (
                      <span className={data.streamBuffers.percentOfBudget >= 80 ? 'text-amber-400' : 'text-zinc-500'}>
                        {' '}({data.streamBuffers.percentOfBudget}%)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : <Loading />}
        </Card>
      </div>

      {/* ── Breakdowns ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card heading="Listeners by Referer">
          {isLoading ? <Loading /> : <RefererBreakdown data={data?.listenersByReferer ?? {}} />}
        </Card>
        <Card heading="Listeners by Country">
          {isLoading ? <Loading /> : <CountryBreakdown data={data?.listenersByCountry ?? {}} />}
        </Card>
      </div>

      {/* ── Listeners ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card heading="Top 10 by Listening Time">
          {isLoading ? <Loading /> : <TopListeners listeners={data?.listeners ?? []} />}
        </Card>
        <Card className="xl:col-span-2" heading="Connected Listeners">
          {isLoading ? <Loading /> : <ListenerTable listeners={data?.listeners ?? []} />}
        </Card>
      </div>
    </div>
  )
}

/* ── Shared bits ────────────────────────────────────────────── */

function Card({ children, heading, className = '' }: { children: React.ReactNode; heading?: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/80 ${className}`}>
      {heading && (
        <div className="border-b border-zinc-800/60 px-4 py-3">
          <h2 className="text-sm font-medium text-zinc-400">{heading}</h2>
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function Loading() {
  return <div className="py-6 text-center text-sm text-zinc-600">Loading...</div>
}

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  rtp:     { label: 'Studio (RTP)', cls: 'border-emerald-700/60 bg-emerald-950/50 text-emerald-400' },
  autodj:  { label: 'AutoDJ',       cls: 'border-amber-700/60 bg-amber-950/50 text-amber-400' },
  silence: { label: 'Silence',      cls: 'border-red-700/60 bg-red-950/50 text-red-400' },
}

function OnAirBadge({ source }: { source: string | null }) {
  const b = (source ? SOURCE_BADGES[source] : undefined) ?? {
    label: source ?? 'Off air',
    cls: 'border-red-700/60 bg-red-950/50 text-red-400',
  }
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${b.cls}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      {b.label}
    </span>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${accent ? 'text-emerald-400' : ''}`}>{value}</p>
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

function ProcessSummary({ processes }: { processes: TrackedProcess[] }) {
  const live = processes.filter((p) => p.status !== 'exited')
  const hanging = live.filter((p) => p.status === 'hanging').length
  const childRss = live.reduce((sum, p) => sum + (p.rssBytes ?? 0), 0)

  return (
    <Link
      to="/dashboard/system"
      className="-mx-1 flex items-center justify-between rounded-md px-1 py-1 transition hover:bg-zinc-800/50"
    >
      <span className="text-zinc-500">ffmpeg</span>
      <span className="flex items-center gap-2 font-mono text-zinc-300">
        {hanging > 0 && (
          <span className="rounded bg-red-950/60 px-1.5 py-0.5 text-xs font-medium text-red-400">
            {hanging} hanging
          </span>
        )}
        <span>
          {live.length} · {Math.round(childRss / 1048576)} MB
        </span>
      </span>
    </Link>
  )
}
