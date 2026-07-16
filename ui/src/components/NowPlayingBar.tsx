import type { NowPlayingEntry } from '../hooks/useNowPlaying'

export default function NowPlayingBar({ entry }: { entry: NowPlayingEntry }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>

      <div className="min-w-0">
        <p className="text-xs text-zinc-500">Now Playing</p>
        {entry.isSong ? (
          <p className="truncate text-sm font-medium text-zinc-100">
            {entry.artist && <span className="text-zinc-400">{entry.artist} — </span>}
            {entry.title}
            {entry.album && (
              <span className="ml-2 text-xs text-zinc-500 italic">{entry.album}</span>
            )}
          </p>
        ) : (
          <p className="truncate text-sm font-medium text-zinc-300">{entry.title}</p>
        )}
      </div>
    </div>
  )
}
