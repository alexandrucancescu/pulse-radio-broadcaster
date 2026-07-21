import { useEffect, useState } from 'react'
import { type ServerConfig, useConfig, useSaveSection } from '../../hooks/useConfig'
import {
  ErrorBox,
  Field,
  NumberInput,
  PageTitle,
  SaveButton,
  Section,
  TextArea,
  Toggle,
} from '../../components/config/fields'

export default function ServerConfigPage() {
  const { data, error } = useConfig()
  const save = useSaveSection('server')
  const [form, setForm] = useState<ServerConfig | null>(null)
  const [blockedUaText, setBlockedUaText] = useState('')

  useEffect(() => {
    if (data && !form) {
      setForm(data.config.server)
      setBlockedUaText(data.config.server.blockedUserAgents.join('\n'))
    }
  }, [data, form])

  if (error) return <ErrorBox error={error} />
  if (!form) return <div className="py-20 text-center text-zinc-500">Loading...</div>

  const set = (patch: Partial<ServerConfig>) => setForm({ ...form, ...patch })

  const submit = () =>
    save.mutate({
      ...form,
      streamMaxBufferSeconds: Number(form.streamMaxBufferSeconds) || 300,
      streamTotalBufferMb: Number(form.streamTotalBufferMb) || 0,
      maxConnectionsPerIp: Number(form.maxConnectionsPerIp) || 0,
      icyMetaint: Number(form.icyMetaint) || 16000,
      blockedUserAgents: blockedUaText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    })

  return (
    <>
      <PageTitle
        title="Server Settings"
        subtitle="Listener protection and stream delivery tuning. All settings apply live — no restart needed."
      />
      <ErrorBox error={save.error} />

      <Section
        title="Listener buffer protection"
        footer={<SaveButton saving={save.isPending} onClick={submit} />}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Max buffer per listener (seconds)"
            hint="A listener this far behind is kicked as stalled"
          >
            <NumberInput
              value={form.streamMaxBufferSeconds}
              min={10}
              onChange={(v) => set({ streamMaxBufferSeconds: v === '' ? 0 : v })}
            />
          </Field>
          <Field
            label="Total buffer budget (MB)"
            hint="Global cap across all listeners; worst-buffered are kicked first. 0 disables."
          >
            <NumberInput
              value={form.streamTotalBufferMb}
              min={0}
              onChange={(v) => set({ streamTotalBufferMb: v === '' ? 0 : v })}
            />
          </Field>
          <Field
            label="Max connections per IP"
            hint="Rejected with 429 above this. 0 disables."
          >
            <NumberInput
              value={form.maxConnectionsPerIp}
              min={0}
              onChange={(v) => set({ maxConnectionsPerIp: v === '' ? 0 : v })}
            />
          </Field>
          <Field label="ICY metadata interval (bytes)">
            <NumberInput
              value={form.icyMetaint}
              min={1024}
              onChange={(v) => set({ icyMetaint: v === '' ? 0 : v })}
            />
          </Field>
        </div>

        <Field
          label="Blocked user agents"
          hint="One per line; case-insensitive substring match, rejected with 403. Leave empty to allow all."
        >
          <TextArea
            value={blockedUaText}
            onChange={setBlockedUaText}
            rows={4}
            placeholder={'Bytespider\npython-requests'}
          />
        </Field>

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">
            Debug: per-listener buffered bytes in stats
          </span>
          <Toggle checked={form.statsDebug} onChange={(v) => set({ statsDebug: v })} />
        </div>
      </Section>
    </>
  )
}
