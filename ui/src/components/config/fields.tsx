import type { ReactNode } from 'react'

export function Section({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
      </header>
      <div className="space-y-4 p-4">{children}</div>
      {footer && <div className="border-t border-zinc-800 px-4 py-3">{footer}</div>}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-600">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500'

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  )
}

export function NumberInput({
  value,
  onChange,
  min,
}: {
  value: number | ''
  onChange: (v: number | '') => void
  min?: number
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={inputClass}
    />
  )
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={`${inputClass} font-mono text-xs`}
    />
  )
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-red-600' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? 'left-4.5' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export function SaveButton({
  onClick,
  saving,
  disabled,
}: {
  onClick: () => void
  saving: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  )
}

export function ErrorBox({ error }: { error: Error | null }) {
  if (!error) return null
  return (
    <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm break-all text-red-300">
      {error.message}
    </div>
  )
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
    </div>
  )
}
