import { useEffect, useRef, useState } from 'react'
import { type StationConfig, useConfig, useSaveSection } from '../../hooks/useConfig'
import { authFetch } from '../../lib/auth'
import {
  ErrorBox,
  Field,
  PageTitle,
  SaveButton,
  Section,
  TextInput,
  Toggle,
} from '../../components/config/fields'

export default function StationConfigPage() {
  const { data, error } = useConfig()
  const save = useSaveSection('station')
  const [form, setForm] = useState<StationConfig | null>(null)

  useEffect(() => {
    if (data && !form) setForm(data.config.station)
  }, [data, form])

  if (error) return <ErrorBox error={error} />
  if (!form) return <div className="py-20 text-center text-zinc-500">Loading...</div>

  const set = (patch: Partial<StationConfig>) => setForm({ ...form, ...patch })

  return (
    <>
      <PageTitle
        title="Station"
        subtitle="Identity sent to players via ICY headers and shown on the public page. Applies after restart."
      />
      <ErrorBox error={save.error} />

      <Section
        title="Station identity"
        footer={
          <SaveButton
            saving={save.isPending}
            onClick={() =>
              save.mutate({ ...form, url: form.url?.trim() ? form.url.trim() : undefined })
            }
          />
        }
      >
        <Field label="Name">
          <TextInput value={form.name} onChange={(name) => set({ name })} />
        </Field>
        <Field label="Description">
          <TextInput value={form.description} onChange={(description) => set({ description })} />
        </Field>
        <Field label="Genre">
          <TextInput value={form.genre} onChange={(genre) => set({ genre })} />
        </Field>
        <Field label="Website URL" hint="Sent as icy-url; players show it as a link">
          <TextInput
            value={form.url ?? ''}
            onChange={(url) => set({ url })}
            placeholder="https://…"
          />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">
            Public station (icy-pub, directories may list it)
          </span>
          <Toggle checked={form.public} onChange={(v) => set({ public: v })} />
        </div>
      </Section>

      <LogoSection />
    </>
  )
}

function LogoSection() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasCustom, setHasCustom] = useState<boolean | null>(null)
  // Server-side generation version: survives page refreshes, so the
  // preview always cache-busts to the currently generated set
  const [version, setVersion] = useState<number | null>(null)

  const refreshStatus = () =>
    authFetch('/api/branding')
      .then((res) => res.json())
      .then((body) => {
        setHasCustom(body.hasCustomLogo)
        setVersion(body.version)
      })
      .catch(() => setHasCustom(null))

  useEffect(() => {
    refreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authFetch('/api/branding/logo', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      await refreshStatus()
      setSuccess(`Logo updated — favicons and player artwork regenerated from ${file.name}`)
    } catch {
      setError('Upload failed — could not reach the server')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function reset() {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await authFetch('/api/branding/logo', { method: 'DELETE' })
      await refreshStatus()
      setSuccess('Reverted to the default Pulse icon')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Logo & favicons">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="flex items-center gap-5">
        {version !== null && (
          <img
            src={`/logo.png?v=${version}`}
            alt="Station logo"
            className="h-24 w-24 rounded-lg border border-zinc-800 bg-zinc-950 object-contain p-1"
          />
        )}
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">
            {hasCustom === false && 'Using the default Pulse icon — upload your station logo.'}
            {hasCustom === true && 'Custom logo active.'}
            {hasCustom === null && 'Logo status unknown.'}
          </p>
          <p className="text-xs text-zinc-600">
            SVG, PNG, JPG or WebP — square, ideally 1200×1200 or vector. Generates all favicons,
            the iOS home/lock-screen icon and the player artwork automatically. Applies live.
          </p>
          <div className="flex gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".svg,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Upload logo'}
            </button>
            {hasCustom && (
              <button
                onClick={reset}
                disabled={busy}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
              >
                Reset to default
              </button>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}
