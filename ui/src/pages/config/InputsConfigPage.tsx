import { useEffect, useState } from 'react'
import { type InputsConfig, useConfig, useSaveSection } from '../../hooks/useConfig'
import {
  ErrorBox,
  Field,
  NumberInput,
  PageTitle,
  SaveButton,
  Section,
  TextArea,
  TextInput,
} from '../../components/config/fields'

export default function InputsConfigPage() {
  const { data, error } = useConfig()
  const save = useSaveSection('inputs')
  const [form, setForm] = useState<InputsConfig | null>(null)
  const [allowedIpsText, setAllowedIpsText] = useState('')

  useEffect(() => {
    if (data && !form) {
      setForm(data.config.inputs)
      setAllowedIpsText(data.config.inputs.rtp.allowedIps.join('\n'))
    }
  }, [data, form])

  if (error) return <ErrorBox error={error} />
  if (!form) return <div className="py-20 text-center text-zinc-500">Loading...</div>

  const rtp = form.rtp
  const set = (patch: Partial<InputsConfig['rtp']>) =>
    setForm({ ...form, rtp: { ...rtp, ...patch } })

  const submit = () =>
    save.mutate({
      switchBackDelaySec: Number(form.switchBackDelaySec) || 15,
      rtp: {
        ...rtp,
        allowedIps: allowedIpsText
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        sampleRate: Number(rtp.sampleRate) || 44100,
        noDataDisconnectDelaySec: Number(rtp.noDataDisconnectDelaySec) || 60,
        reorderDepth: Number(rtp.reorderDepth) || 40,
      },
    })

  return (
    <>
      <PageTitle
        title="Inputs"
        subtitle="Audio sources feeding the station. Applies after restart. The RTP port and bind address stay in the environment (coupled to container port mappings)."
      />
      <ErrorBox error={save.error} />

      <Section
        title="RTP source"
        footer={<SaveButton saving={save.isPending} onClick={submit} />}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sample rate (Hz)">
            <NumberInput
              value={rtp.sampleRate}
              onChange={(v) => set({ sampleRate: v === '' ? 0 : v })}
            />
          </Field>
          <Field label="PCM format">
            <TextInput value={rtp.format} onChange={(format) => set({ format })} />
          </Field>
          <Field
            label="No-data disconnect (seconds)"
            hint="Source considered down after this much silence"
          >
            <NumberInput
              value={rtp.noDataDisconnectDelaySec}
              min={1}
              onChange={(v) => set({ noDataDisconnectDelaySec: v === '' ? 0 : v })}
            />
          </Field>
          <Field label="Reorder buffer depth (packets)">
            <NumberInput
              value={rtp.reorderDepth}
              min={1}
              onChange={(v) => set({ reorderDepth: v === '' ? 0 : v })}
            />
          </Field>
        </div>
        <Field
          label="Switch-back stability delay (seconds)"
          hint="A recovered studio feed must stay stable this long before the AutoDJ hands back to it"
        >
          <NumberInput
            value={form.switchBackDelaySec}
            min={0}
            onChange={(v) => setForm({ ...form, switchBackDelaySec: v === '' ? 0 : v })}
          />
        </Field>
        <Field
          label="Allowed source IPs"
          hint="One per line (or comma-separated); CIDR ranges supported. RTP has no authentication — this is the access control."
        >
          <TextArea
            value={allowedIpsText}
            onChange={setAllowedIpsText}
            rows={4}
            placeholder={'203.0.113.10\n10.0.0.0/24'}
          />
        </Field>
      </Section>
    </>
  )
}
