import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  type MediaType,
  uploadFile,
  useDeleteFile,
  useLibrary,
  useSetType,
} from '../hooks/useLibrary'
import { ErrorBox, PageTitle, Section } from '../components/config/fields'

type StagedFile = {
  file: File
  type: MediaType
}

function formatSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export default function LibraryPage() {
  const { data, error } = useLibrary()
  const setType = useSetType()
  const deleteFile = useDeleteFile()
  const queryClient = useQueryClient()

  const fileInput = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])

  const stage = (files: FileList | null) => {
    if (!files) return
    // FileList is LIVE — materialize it before clearing the input, or the
    // state updater (which runs after this handler) sees an empty list
    const items = Array.from(files).map((file) => ({ file, type: 'song' as MediaType }))
    setStaged((prev) => [...prev, ...items])
    if (fileInput.current) fileInput.current.value = ''
  }

  const setStagedType = (i: number, type: MediaType) =>
    setStaged(staged.map((s, j) => (j === i ? { ...s, type } : s)))

  async function uploadAll() {
    setUploadErrors([])
    setUploading({ done: 0, total: staged.length })

    const errors: string[] = []
    for (let i = 0; i < staged.length; i++) {
      try {
        await uploadFile(staged[i].file, staged[i].type)
      } catch (e) {
        errors.push(`${staged[i].file.name}: ${e instanceof Error ? e.message : 'failed'}`)
      }
      setUploading({ done: i + 1, total: staged.length })
    }

    setUploading(null)
    setStaged([])
    setUploadErrors(errors)
    queryClient.invalidateQueries({ queryKey: ['library'] })
  }

  const songs = data?.files.filter((f) => f.type === 'song') ?? []
  const jingles = data?.files.filter((f) => f.type === 'jingle') ?? []

  return (
    <div className="space-y-6">
      <PageTitle
        title="AutoDJ Library"
        subtitle="Songs and jingles played automatically when the studio feed goes down — a random jingle first, then the shuffled library. Changes apply immediately."
      />
      <ErrorBox error={error} />
      {uploadErrors.map((e) => (
        <div
          key={e}
          className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300"
        >
          {e}
        </div>
      ))}

      {/* ── Batch upload ─────────────────────────────────── */}
      <Section title="Upload files">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".mp3,.aac,.m4a,.ogg,.opus,.flac,.wav"
          onChange={(e) => stage(e.target.files)}
          className="hidden"
        />
        <button
          onClick={() => fileInput.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-zinc-700 px-4 py-8 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
        >
          Click to select audio files (batch selection supported)
        </button>

        {staged.length > 0 && (
          <div className="space-y-2">
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {staged.map((s, i) => (
                <div
                  key={`${s.file.name}-${i}`}
                  className="flex items-center gap-3 rounded-md bg-zinc-950/50 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                    {s.file.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-600">
                    {formatSize(s.file.size)}
                  </span>
                  <div className="flex shrink-0 rounded-md bg-zinc-800 p-0.5">
                    {(['song', 'jingle'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setStagedType(i, t)}
                        className={`rounded px-2 py-0.5 text-xs capitalize ${
                          s.type === t
                            ? 'bg-red-700 text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setStaged(staged.filter((_, j) => j !== i))}
                    className="shrink-0 text-xs text-zinc-600 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {staged.filter((s) => s.type === 'song').length} songs,{' '}
                {staged.filter((s) => s.type === 'jingle').length} jingles
              </p>
              <button
                onClick={uploadAll}
                disabled={uploading !== null}
                className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {uploading
                  ? `Uploading ${uploading.done}/${uploading.total}…`
                  : `Upload ${staged.length} file${staged.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Library contents ─────────────────────────────── */}
      {(['song', 'jingle'] as const).map((type) => {
        const files = type === 'song' ? songs : jingles
        return (
          <Section key={type} title={`${type === 'song' ? 'Songs' : 'Jingles'} (${files.length})`}>
            {files.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-600">
                {type === 'song'
                  ? 'No songs yet — the AutoDJ stays inactive until at least one song exists.'
                  : 'No jingles — fallback starts directly with a song.'}
              </p>
            ) : (
              <div className="space-y-1">
                {files.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-zinc-950/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                      {f.name}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-600">
                      {formatSize(f.sizeBytes)}
                    </span>
                    <button
                      onClick={() =>
                        setType.mutate({
                          name: f.name,
                          from: f.type,
                          to: f.type === 'song' ? 'jingle' : 'song',
                        })
                      }
                      className="shrink-0 text-xs text-zinc-500 hover:text-zinc-200"
                    >
                      Make {f.type === 'song' ? 'jingle' : 'song'}
                    </button>
                    <button
                      onClick={() => deleteFile.mutate({ name: f.name, type: f.type })}
                      className="shrink-0 text-xs text-zinc-500 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )
      })}
    </div>
  )
}
