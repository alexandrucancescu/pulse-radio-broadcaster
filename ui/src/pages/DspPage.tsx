import { useEffect, useRef, useState } from 'react'
import {
  useDsp,
  type DynamicsParams,
  type DynamicsPreset,
  type EqBand,
  type EqParams,
} from '../hooks/useDsp'
import EqGraph from '../components/dsp/EqGraph'
import {
  EQ_PRESETS,
  GRAPHIC_FREQS,
  GRAPHIC_GAIN_RANGE,
  GRAPHIC_LABELS,
  MAX_BANDS,
  advancedBands,
  graphicBands,
  matchesPreset,
  presetToEq,
  readGraphicGains,
  setGraphicGain,
} from '../lib/eq'

const DYN_PRESETS: DynamicsPreset[] = ['clean', 'warm', 'punchy', 'loud']

// Log mapping for the Advanced frequency slider: 0..1000 → 20..20000 Hz
const freqToSlider = (f: number) => Math.round((Math.log(f / 20) / Math.log(1000)) * 1000)
const sliderToFreq = (v: number) => Math.round(20 * Math.pow(1000, v / 1000))
const fmtHz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k` : `${f}`)

export default function DspPage() {
  const { query, eqMutation, dynamicsMutation, commitMutation, resetMutation } = useDsp()

  const [eq, setEq] = useState<EqParams | null>(null)
  const [dynamics, setDynamics] = useState<DynamicsParams | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Initialize local state once from the server's PREVIEW settings
  useEffect(() => {
    if (query.data && !eq && !dynamics) {
      setEq(query.data.preview.eq)
      setDynamics(query.data.preview.dynamics)
    }
  }, [query.data, eq, dynamics])

  // Preview differs from what's on air → offer commit/discard
  const dirty =
    !!query.data &&
    !!eq &&
    !!dynamics &&
    JSON.stringify({ eq, dynamics }) !== JSON.stringify(query.data.live)

  const commit = () => commitMutation.mutate()

  const reset = () =>
    resetMutation.mutateAsync().then((data) => {
      setEq(data.preview.eq)
      setDynamics(data.preview.dynamics)
    })

  // Debounce PATCHes so slider drags don't flood the server
  const eqTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const updateEq = (next: EqParams) => {
    setEq(next)
    clearTimeout(eqTimer.current)
    eqTimer.current = setTimeout(() => eqMutation.mutate(next), 150)
  }

  const dynTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const updateDynamics = (next: DynamicsParams) => {
    setDynamics(next)
    clearTimeout(dynTimer.current)
    dynTimer.current = setTimeout(() => dynamicsMutation.mutate(next), 150)
  }

  const token = query.data?.monitorToken
  const monitorUrl = token
    ? `${window.location.protocol}//${window.location.host}/monitor.wav?token=${token}`
    : `${window.location.protocol}//${window.location.host}/monitor.wav`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audio Processing</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Changes apply to the monitor preview only — commit to put them on air.
        </p>
      </div>

      {/* Always rendered so it never shifts the page when edits appear — the
          slot is reserved whether or not the preview is dirty. */}
      <div
        className={`flex min-h-[3.25rem] items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors ${
          dirty
            ? 'border-amber-900/50 bg-amber-950/40'
            : 'border-zinc-800 bg-zinc-900/40'
        }`}
      >
        <p className={`text-sm ${dirty ? 'text-amber-300' : 'text-zinc-500'}`}>
          {dirty
            ? 'Preview differs from the live chain. Listen on the monitor, then commit.'
            : 'Preview matches what’s on air.'}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={reset}
            disabled={!dirty || resetMutation.isPending}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-zinc-300 transition hover:bg-zinc-700 disabled:cursor-default disabled:opacity-40"
          >
            Discard
          </button>
          <button
            onClick={commit}
            disabled={!dirty || commitMutation.isPending}
            className="rounded-md bg-amber-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-default disabled:bg-zinc-700 disabled:text-zinc-400 disabled:opacity-60"
          >
            {commitMutation.isPending ? 'Committing…' : 'Commit to live'}
          </button>
        </div>
      </div>

      {query.error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          Failed to load DSP settings: {query.error.message}
        </div>
      )}

      {(eqMutation.error || dynamicsMutation.error) && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          Failed to save: {(eqMutation.error ?? dynamicsMutation.error)?.message}
        </div>
      )}

      {!eq || !dynamics ? (
        <div className="py-20 text-center text-zinc-500">Loading...</div>
      ) : (
        <>
          <Equalizer eq={eq} updateEq={updateEq} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced} />

          <Dynamics dynamics={dynamics} updateDynamics={updateDynamics} />

          <Monitor monitorUrl={monitorUrl} />
        </>
      )}
    </div>
  )
}

/* ── Equalizer ─────────────────────────────────────────────────────────── */

function Equalizer({
  eq,
  updateEq,
  showAdvanced,
  setShowAdvanced,
}: {
  eq: EqParams
  updateEq: (next: EqParams) => void
  showAdvanced: boolean
  setShowAdvanced: (v: boolean) => void
}) {
  const gains = readGraphicGains(eq.bands)
  const advanced = advancedBands(eq.bands)
  const bandCount = eq.bands.length

  const disabled = !eq.enabled

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Equalizer</h2>
          <p className="text-xs text-zinc-500">Shape the tone — previewed on the monitor</p>
        </div>
        <Toggle checked={eq.enabled} onChange={(enabled) => updateEq({ ...eq, enabled })} />
      </header>

      <div className={`space-y-5 p-4 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {EQ_PRESETS.map((preset) => {
            const active = matchesPreset(eq, preset)
            return (
              <button
                key={preset.name}
                title={preset.blurb}
                onClick={() => updateEq(presetToEq(preset, true))}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-700'
                }`}
              >
                {preset.name}
              </button>
            )
          })}
        </div>

        {/* Response curve */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2 py-3">
          <EqGraph eq={eq} />
        </div>

        {/* Preamp + graphic bands */}
        <div className="flex items-stretch gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <BandSlider
            label="Pre"
            sub="amp"
            value={eq.preampDb}
            min={-12}
            max={12}
            onChange={(preampDb) => updateEq({ ...eq, preampDb })}
          />
          <div className="w-px shrink-0 bg-zinc-800" />
          <div className="flex flex-1 justify-between gap-1">
            {GRAPHIC_FREQS.map((freq, i) => (
              <BandSlider
                key={freq}
                label={GRAPHIC_LABELS[i]}
                value={gains[i]}
                min={-GRAPHIC_GAIN_RANGE}
                max={GRAPHIC_GAIN_RANGE}
                onChange={(gain) => updateEq({ ...eq, bands: setGraphicGain(eq.bands, i, gain) })}
              />
            ))}
          </div>
        </div>

        {/* Advanced parametric */}
        <div className="rounded-lg border border-zinc-800">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left"
          >
            <span className="text-xs font-medium text-zinc-400">
              Advanced — parametric bands
              {advanced.length > 0 && (
                <span className="ml-2 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {advanced.length} extra
                </span>
              )}
            </span>
            <span className={`text-zinc-500 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>›</span>
          </button>

          {showAdvanced && (
            <div className="space-y-3 border-t border-zinc-800 p-4">
              <p className="text-xs text-zinc-600">
                Full control over extra bands — arbitrary frequency, gain and Q, plus shelves. These
                stack on top of the graphic sliders above.
              </p>

              {advanced.map((band) => {
                // Index of this band within the real eq.bands array
                const realIndex = eq.bands.indexOf(band)
                const patchBand = (patch: Partial<EqBand>) =>
                  updateEq({
                    ...eq,
                    bands: eq.bands.map((b, j) => (j === realIndex ? { ...b, ...patch } : b)),
                  })
                const removeBand = () =>
                  updateEq({ ...eq, bands: eq.bands.filter((_, j) => j !== realIndex) })

                return (
                  <div key={realIndex} className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex items-center justify-between">
                      <select
                        value={band.type}
                        onChange={(e) => patchBand({ type: e.target.value as EqBand['type'] })}
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                      >
                        <option value="peaking">Peaking</option>
                        <option value="lowshelf">Low shelf</option>
                        <option value="highshelf">High shelf</option>
                      </select>
                      <button onClick={removeBand} className="text-xs text-zinc-500 hover:text-red-400">
                        Remove
                      </button>
                    </div>

                    <HSlider
                      label="Frequency"
                      value={freqToSlider(band.frequency)}
                      min={0}
                      max={1000}
                      step={1}
                      display={`${fmtHz(band.frequency)} Hz`}
                      onChange={(v) => patchBand({ frequency: sliderToFreq(v) })}
                    />
                    <HSlider
                      label="Gain"
                      value={band.gainDb}
                      min={-12}
                      max={12}
                      step={0.5}
                      unit="dB"
                      onChange={(gainDb) => patchBand({ gainDb })}
                    />
                    <HSlider
                      label="Q"
                      value={band.q}
                      min={0.1}
                      max={10}
                      step={0.1}
                      onChange={(q) => patchBand({ q })}
                    />
                  </div>
                )
              })}

              {bandCount < MAX_BANDS ? (
                <button
                  onClick={() =>
                    updateEq({
                      ...eq,
                      bands: [...graphicBands(eq.bands), ...advanced, { type: 'peaking', frequency: 1000, gainDb: 0, q: 1 }],
                    })
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
                >
                  + Add band
                </button>
              ) : (
                <p className="text-xs text-zinc-600">Maximum of {MAX_BANDS} bands reached.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── Dynamics ──────────────────────────────────────────────────────────── */

function Dynamics({
  dynamics,
  updateDynamics,
}: {
  dynamics: DynamicsParams
  updateDynamics: (next: DynamicsParams) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">
            Dynamics
            <span className="ml-2 rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] font-normal text-amber-500">
              stub — passes through unprocessed
            </span>
          </h2>
          <p className="text-xs text-zinc-500">Loudness and limiting</p>
        </div>
        <Toggle checked={dynamics.enabled} onChange={(enabled) => updateDynamics({ ...dynamics, enabled })} />
      </header>

      <div className={`space-y-5 p-4 ${dynamics.enabled ? '' : 'pointer-events-none opacity-40'}`}>
        <div className="flex flex-wrap gap-2">
          {DYN_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => updateDynamics({ ...dynamics, preset })}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                dynamics.preset === preset
                  ? 'bg-blue-600 text-white'
                  : 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <HSlider
          label="Target loudness"
          value={dynamics.targetLufs}
          min={-24}
          max={-9}
          step={0.5}
          unit="LUFS"
          onChange={(targetLufs) => updateDynamics({ ...dynamics, targetLufs })}
        />
        <HSlider
          label="Drive"
          value={dynamics.drive}
          min={-10}
          max={10}
          step={0.5}
          onChange={(drive) => updateDynamics({ ...dynamics, drive })}
        />
        <HSlider
          label="Limiter ceiling"
          value={dynamics.ceilingDb}
          min={-6}
          max={0}
          step={0.1}
          unit="dB"
          onChange={(ceilingDb) => updateDynamics({ ...dynamics, ceilingDb })}
        />
      </div>
    </section>
  )
}

/* ── Monitor ───────────────────────────────────────────────────────────── */

function Monitor({ monitorUrl }: { monitorUrl: string }) {
  const commands: { os: string; cmd: string }[] = [
    { os: 'macOS', cmd: `/Applications/VLC.app/Contents/MacOS/VLC --network-caching=100 "${monitorUrl}"` },
    { os: 'Windows', cmd: `"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" --network-caching=100 "${monitorUrl}"` },
    { os: 'Linux', cmd: `vlc --network-caching=100 "${monitorUrl}"` },
    { os: 'ffplay (any OS, lowest latency)', cmd: `ffplay -fflags nobuffer -i "${monitorUrl}"` },
  ]

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">Low-latency monitor</h2>
        <p className="text-xs text-zinc-500">Listen to the processed audio while tweaking</p>
      </header>
      <div className="space-y-3 p-4 text-sm text-zinc-400">
        {commands.map(({ os, cmd }) => (
          <div key={os} className="space-y-1">
            <p className="text-xs font-medium text-zinc-500">{os}</p>
            <pre className="overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-300">{cmd}</pre>
          </div>
        ))}
        <p className="text-xs text-zinc-500">
          You can also open the URL in VLC via Media → Open Network Stream, but set Show more options →
          Caching to ~100ms for low latency.
        </p>
      </div>
    </section>
  )
}

/* ── Controls ──────────────────────────────────────────────────────────── */

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? 'left-4.5' : 'left-0.5'
        }`}
      />
    </button>
  )
}

// Vertical slider used by the graphic EQ + preamp.
function BandSlider({
  label,
  sub,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  sub?: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <span className={`font-mono text-[10px] tabular-nums ${value === 0 ? 'text-zinc-600' : 'text-blue-300'}`}>
        {value > 0 ? `+${value}` : value}
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={0.5}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} band`}
        className="h-28 cursor-pointer accent-blue-500"
        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
      />
      <div className="text-center leading-tight">
        <div className="text-[10px] font-medium text-zinc-400">{label}</div>
        {sub && <div className="text-[9px] text-zinc-600">{sub}</div>}
      </div>
    </div>
  )
}

// Horizontal slider used by Advanced bands + Dynamics.
function HSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  display?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">
          {display ?? `${value > 0 && unit === 'dB' ? '+' : ''}${value}${unit ? ` ${unit}` : ''}`}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  )
}
