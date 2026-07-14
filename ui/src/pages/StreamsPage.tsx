import { useStreams } from '../hooks/useStreams'
import Footer from '../components/Footer'

const FORMAT_LABELS: Record<string, string> = {
  mp3: 'MP3',
  adts: 'AAC',
  opus: 'Opus',
  ogg: 'OGG',
}

export default function StreamsPage() {
  const { data, isLoading, error } = useStreams()

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-8">
        {isLoading ? (
          <div className="py-20 text-center text-zinc-500">Loading...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            Failed to load streams: {error.message}
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold">{data?.station.name}</h1>
              {data?.station.description && data.station.description !== 'N/A' && (
                <p className="text-zinc-400">{data.station.description}</p>
              )}
              {data?.station.genre && data.station.genre !== 'N/A' && (
                <p className="text-sm text-zinc-500">Genre: {data.station.genre}</p>
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-medium text-zinc-400">
                Available Streams
              </h2>

              {data?.streams.map((stream) => (
                <div
                  key={stream.paths[0]}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs font-medium">
                          {FORMAT_LABELS[stream.format] ?? stream.format.toUpperCase()}
                        </span>
                        {stream.bitrate && (
                          <span className="text-xs text-zinc-500">
                            {stream.bitrate} kbps
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${stream.active ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${stream.active ? 'bg-emerald-500' : 'bg-red-500'}`}
                          />
                          {stream.active ? 'Live' : 'Offline'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {stream.paths.map((path) => (
                          <a
                            key={path}
                            href={path}
                            className="font-mono text-sm text-blue-400 hover:text-blue-300 hover:underline"
                          >
                            {path}
                          </a>
                        ))}
                      </div>
                    </div>

                    <span className="text-xs text-zinc-500">
                      {stream.listeners} listener{stream.listeners !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-400">
                Open in Media Player
              </h2>

              <div className="flex gap-3">
                <a
                  href="/listen.m3u"
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-700"
                >
                  Download .m3u
                </a>
                <a
                  href="/listen.pls"
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-700"
                >
                  Download .pls
                </a>
              </div>

              <p className="text-xs text-zinc-500">
                Open with VLC, Winamp, foobar2000, or any media player that supports internet radio.
              </p>
            </div>
          </>
        )}

        <Footer />
      </div>
    </div>
  )
}
