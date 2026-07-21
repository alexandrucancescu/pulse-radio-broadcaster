import { useStats } from '../hooks/useStats'
import { useNowPlaying } from '../hooks/useNowPlaying'
import ListenerTable from '../components/ListenerTable'
import RefererBreakdown from '../components/RefererBreakdown'
import CountryBreakdown from '../components/CountryBreakdown'
import TopListeners from '../components/TopListeners'
import UptimePanel from '../components/UptimePanel'
import NowPlayingBar from '../components/NowPlayingBar'

export default function DashboardPage() {
  const { data, isLoading, error } = useStats()
  const { data: nowPlaying } = useNowPlaying()

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Live Dashboard</h1>
          {data?.uptime && <OnAirBadge source={data.uptime.onAir} />}
        </div>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Failed to fetch stats: {error.message}
          </div>
        )}

        {data?.memory && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-zinc-400">
            <span className="font-medium text-zinc-500">Memory</span>
            {/* rss is process-wide (both threads share it); heaps are per-isolate */}
            <MemStat label="Process RSS" bytes={data.memory.main.rss} />
            <MemStat label="App heap" bytes={data.memory.main.heapUsed} />
            <MemStat label="Worker heap" bytes={data.memory.worker.heapUsed} />
            <MemStat label="Audio buffers" bytes={data.memory.main.arrayBuffers} />
            {data.streamBuffers && (
              <span>
                <span className="text-zinc-500">Listener buffers</span>{' '}
                <span className="font-mono text-zinc-300">
                  {(data.streamBuffers.totalBytes / 1048576).toFixed(1)} MB
                </span>
                {data.streamBuffers.percentOfBudget !== null && (
                  <span
                    className={`font-mono ${
                      data.streamBuffers.percentOfBudget >= 80
                        ? 'text-amber-400'
                        : 'text-zinc-500'
                    }`}
                  >
                    {' '}({data.streamBuffers.percentOfBudget}% of budget)
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {nowPlaying?.current && <NowPlayingBar entry={nowPlaying.current} />}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Listeners"
            value={isLoading ? '—' : String(data?.listenerCount ?? 0)}
          />
          <StatCard
            label="Unique IPs"
            value={isLoading ? '—' : String(data?.uniqueIpCount ?? 0)}
          />
          <StatCard
            label="Streams"
            value={
              isLoading
                ? '—'
                : String(
                    new Set(data?.listeners.map((l) => l.streamPath)).size,
                  )
            }
          />
          <StatCard
            label="Countries"
            value={
              isLoading
                ? '—'
                : String(
                    Object.keys(data?.listenersByCountry ?? {}).length,
                  )
            }
          />
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-400">
              Stream Uptime
            </h2>
          </div>
          {isLoading ? (
            <div className="px-4 py-8 text-center text-zinc-500">
              Loading...
            </div>
          ) : data?.uptime ? (
            <UptimePanel uptime={data.uptime} />
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-400">
                Listeners by Referer
              </h2>
            </div>
            {isLoading ? (
              <div className="px-4 py-8 text-center text-zinc-500">
                Loading...
              </div>
            ) : (
              <RefererBreakdown data={data?.listenersByReferer ?? {}} />
            )}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-400">
                Listeners by Country
              </h2>
            </div>
            {isLoading ? (
              <div className="px-4 py-8 text-center text-zinc-500">
                Loading...
              </div>
            ) : (
              <CountryBreakdown data={data?.listenersByCountry ?? {}} />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-400">
              Top 10 Listeners by Listening Time
            </h2>
          </div>
          {isLoading ? (
            <div className="px-4 py-8 text-center text-zinc-500">
              Loading...
            </div>
          ) : (
            <TopListeners listeners={data?.listeners ?? []} />
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-400">
              Connected Listeners
            </h2>
          </div>
          {isLoading ? (
            <div className="px-4 py-8 text-center text-zinc-500">
              Loading...
            </div>
          ) : (
            <ListenerTable listeners={data?.listeners ?? []} />
          )}
        </div>

    </div>
  )
}

const SOURCE_BADGES: Record<string, { label: string; classes: string }> = {
  rtp: { label: 'Studio (RTP)', classes: 'border-emerald-800 bg-emerald-950/50 text-emerald-400' },
  autodj: { label: 'AutoDJ', classes: 'border-amber-800 bg-amber-950/50 text-amber-400' },
  silence: { label: 'Silence', classes: 'border-red-800 bg-red-950/50 text-red-400' },
}

function OnAirBadge({ source }: { source: string | null }) {
  const badge = (source ? SOURCE_BADGES[source] : undefined) ?? {
    label: source ?? 'Off air',
    classes: 'border-red-800 bg-red-950/50 text-red-400',
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${badge.classes}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      On air: {badge.label}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}

function MemStat({ label, bytes }: { label: string; bytes: number }) {
  return (
    <span>
      <span className="text-zinc-500">{label}</span>{' '}
      <span className="font-mono text-zinc-300">{Math.round(bytes / 1048576)} MB</span>
    </span>
  )
}
