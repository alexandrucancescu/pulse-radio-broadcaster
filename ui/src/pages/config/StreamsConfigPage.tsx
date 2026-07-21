import { useEffect, useState } from 'react'
import { type StreamConfig, useConfig, useSaveSection } from '../../hooks/useConfig'
import {
  ErrorBox,
  Field,
  NumberInput,
  PageTitle,
  SaveButton,
  Section,
  TextInput,
} from '../../components/config/fields'

const FORMATS = ['mp3', 'adts', 'aac', 'aac_he', 'aac_he_v2', 'opus']

const NEW_STREAM: StreamConfig = {
  format: 'mp3',
  paths: ['/stream.mp3'],
  bitrate: 192,
  channels: 2,
}

export default function StreamsConfigPage() {
  const { data, error } = useConfig()
  const save = useSaveSection('streams')
  const [streams, setStreams] = useState<StreamConfig[] | null>(null)

  useEffect(() => {
    if (data && !streams) setStreams(data.config.streams)
  }, [data, streams])

  if (error) return <ErrorBox error={error} />
  if (!streams) return <div className="py-20 text-center text-zinc-500">Loading...</div>

  const setStream = (i: number, patch: Partial<StreamConfig>) =>
    setStreams(streams.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const submit = () =>
    save.mutate(
      streams.map((s) => ({
        ...s,
        bitrate: s.bitrate || undefined,
        channels: s.channels || undefined,
        sampleRate: s.sampleRate || undefined,
        burstSize: s.burstSize || undefined,
        contentType: s.contentType?.trim() || undefined,
        paths: s.paths.map((p) => p.trim()).filter(Boolean),
      })),
    )

  return (
    <>
      <PageTitle
        title="Output Streams"
        subtitle="The icecast-style mounts listeners connect to. Applies after restart."
      />
      <ErrorBox error={save.error} />

      {streams.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-sm text-zinc-500">
          No streams configured yet — the station serves nothing without one.
        </div>
      )}

      {streams.map((stream, i) => (
        <Section
          key={i}
          title={`Stream ${i + 1} — ${stream.paths[0] ?? 'unnamed'}`}
          footer={
            <button
              onClick={() => setStreams(streams.filter((_, j) => j !== i))}
              className="text-sm text-zinc-500 hover:text-red-400"
            >
              Remove stream
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Format">
              <select
                value={stream.format}
                onChange={(e) => setStream(i, { format: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100"
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bitrate (kbps)">
              <NumberInput
                value={stream.bitrate ?? ''}
                onChange={(v) => setStream(i, { bitrate: v === '' ? undefined : v })}
              />
            </Field>
            <Field label="Paths" hint="Comma-separated, e.g. /stream.mp3, /stream">
              <TextInput
                value={stream.paths.join(', ')}
                onChange={(v) => setStream(i, { paths: v.split(',').map((p) => p.trim()) })}
              />
            </Field>
            <Field label="Channels">
              <NumberInput
                value={stream.channels ?? ''}
                onChange={(v) => setStream(i, { channels: v === '' ? undefined : v })}
              />
            </Field>
            <Field label="Sample rate (Hz)" hint="Empty = input rate">
              <NumberInput
                value={stream.sampleRate ?? ''}
                onChange={(v) => setStream(i, { sampleRate: v === '' ? undefined : v })}
              />
            </Field>
            <Field label="Burst size (bytes)" hint="Empty = 6 seconds of audio">
              <NumberInput
                value={stream.burstSize ?? ''}
                onChange={(v) => setStream(i, { burstSize: v === '' ? undefined : v })}
              />
            </Field>
            <Field label="ICY metadata">
              <select
                value={stream.icyMetadata === undefined ? 'auto' : String(stream.icyMetadata)}
                onChange={(e) =>
                  setStream(i, {
                    icyMetadata:
                      e.target.value === 'auto' ? undefined : e.target.value === 'true',
                  })
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100"
              >
                <option value="auto">Auto (on, except opus)</option>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </Field>
            <Field label="Content-Type override" hint="Usually empty">
              <TextInput
                value={stream.contentType ?? ''}
                onChange={(v) => setStream(i, { contentType: v })}
              />
            </Field>
          </div>
        </Section>
      ))}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStreams([...streams, { ...NEW_STREAM }])}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          + Add stream
        </button>
        <SaveButton
          saving={save.isPending}
          disabled={streams.length === 0}
          onClick={submit}
        />
      </div>
    </>
  )
}
