import { useStats } from './hooks/useStats'
import ListenerTable from './components/ListenerTable'

export default function App() {
  const { data, isLoading, error } = useStats()

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-2xl font-semibold">Pulse Radio</h1>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Failed to fetch stats: {error.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Listeners"
            value={isLoading ? '—' : String(data?.listenerCount ?? 0)}
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
                    new Set(
                      data?.listeners
                        .map((l) => l.geolocation?.country)
                        .filter(Boolean),
                    ).size,
                  )
            }
          />
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
    </div>
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
