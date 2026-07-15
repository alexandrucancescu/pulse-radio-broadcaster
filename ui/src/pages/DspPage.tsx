import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useDsp,
  type DynamicsParams,
  type DynamicsPreset,
  type EqBand,
  type EqParams,
} from '../hooks/useDsp'
import Footer from '../components/Footer'

const PRESETS: DynamicsPreset[] = ['clean', 'warm', 'punchy', 'loud']

// Log mapping for frequency sliders: 0..1000 → 20..20000 Hz
const freqToSlider = (f: number) => Math.round((Math.log(f / 20) / Math.log(1000)) * 1000)
const sliderToFreq = (v: number) => Math.round(20 * Math.pow(1000, v / 1000))

export default function DspPage() {
  const { query, eqMutation, dynamicsMutation } = useDsp()

  const [eq, setEq] = useState<EqParams | null>(null)
  const [dynamics, setDynamics] = useState<DynamicsParams | null>(null)

  // Initialize local state once from the server
  useEffect(() => {
    if (query.data && !eq && !dynamics) {
      setEq(query.data.eq)
      setDynamics(query.data.dynamics)
    }
  }, [query.data, eq, dynamics])

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

  const monitorUrl = `${window.location.protocol}//user:pass@${window.location.host}/monitor.wav`

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Audio Processing</h1>
          <Link to="/dashboard" className="text-sm text-blue-400 hover:underline">
            ← Dashboard
          </Link>
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
            {/* ── Equalizer ─────────────────────────────────── */}
            <section className="rounded-lg border border-zinc-800 bg-zinc-900">
              <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-medium text-zinc-400">
                  Equalizer <span className="text-xs text-zinc-600">(live, no interruption)</span>
                </h2>
                <Toggle
                  checked={eq.enabled}
                  onChange={(enabled) => updateEq({ ...eq, enabled })}
                />
              </header>

              <div className={`space-y-5 p-4 ${eq.enabled ? '' : 'pointer-events-none opacity-40'}`}>
                <Slider
                  label="Preamp"
                  value={eq.preampDb}
                  min={-12}
                  max={12}
                  step={0.5}
                  unit="dB"
                  onChange={(preampDb) => updateEq({ ...eq, preampDb })}
                />

                {eq.bands.map((band, i) => (
                  <div key={i} className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex items-center justify-between">
                      <select
                        value={band.type}
                        onChange={(e) =>
                          updateEq({
                            ...eq,
                            bands: replaceBand(eq.bands, i, { type: e.target.value as EqBand['type'] }),
                          })
                        }
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                      >
                        <option value="peaking">Peaking</option>
                        <option value="lowshelf">Low shelf</option>
                        <option value="highshelf">High shelf</option>
                      </select>
                      <button
                        onClick={() => updateEq({ ...eq, bands: eq.bands.filter((_, j) => j !== i) })}
                        className="text-xs text-zinc-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>

                    <Slider
                      label="Frequency"
                      value={freqToSlider(band.frequency)}
                      min={0}
                      max={1000}
                      step={1}
                      display={`${band.frequency >= 1000 ? `${(band.frequency / 1000).toFixed(1)}k` : band.frequency} Hz`}
                      onChange={(v) =>
                        updateEq({ ...eq, bands: replaceBand(eq.bands, i, { frequency: sliderToFreq(v) }) })
                      }
                    />
                    <Slider
                      label="Gain"
                      value={band.gainDb}
                      min={-12}
                      max={12}
                      step={0.5}
                      unit="dB"
                      onChange={(gainDb) => updateEq({ ...eq, bands: replaceBand(eq.bands, i, { gainDb }) })}
                    />
                    <Slider
                      label="Q"
                      value={band.q}
                      min={0.1}
                      max={10}
                      step={0.1}
                      onChange={(q) => updateEq({ ...eq, bands: replaceBand(eq.bands, i, { q }) })}
                    />
                  </div>
                ))}

                {eq.bands.length < 16 && (
                  <button
                    onClick={() =>
                      updateEq({
                        ...eq,
                        bands: [...eq.bands, { type: 'peaking', frequency: 1000, gainDb: 0, q: 1 }],
                      })
                    }
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    + Add band
                  </button>
                )}
              </div>
            </section>

            {/* ── Dynamics ──────────────────────────────────── */}
            <section className="rounded-lg border border-zinc-800 bg-zinc-900">
              <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-medium text-zinc-400">
                  Dynamics{' '}
                  <span className="text-xs text-amber-500">
                    (stub — audio passes through unprocessed for now)
                  </span>
                </h2>
                <Toggle
                  checked={dynamics.enabled}
                  onChange={(enabled) => updateDynamics({ ...dynamics, enabled })}
                />
              </header>

              <div className={`space-y-5 p-4 ${dynamics.enabled ? '' : 'pointer-events-none opacity-40'}`}>
                <div className="flex gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateDynamics({ ...dynamics, preset })}
                      className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                        dynamics.preset === preset
                          ? 'bg-blue-600 text-white'
                          : 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <Slider
                  label="Target loudness"
                  value={dynamics.targetLufs}
                  min={-24}
                  max={-9}
                  step={0.5}
                  unit="LUFS"
                  onChange={(targetLufs) => updateDynamics({ ...dynamics, targetLufs })}
                />
                <Slider
                  label="Drive"
                  value={dynamics.drive}
                  min={-10}
                  max={10}
                  step={0.5}
                  onChange={(drive) => updateDynamics({ ...dynamics, drive })}
                />
                <Slider
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

            {/* ── Monitor ───────────────────────────────────── */}
            <section className="rounded-lg border border-zinc-800 bg-zinc-900">
              <header className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-medium text-zinc-400">Low-latency monitor</h2>
              </header>
              <div className="space-y-3 p-4 text-sm text-zinc-400">
                <p>
                  Listen to the processed audio with low latency while tweaking (replace user:pass
                  with your stats credentials):
                </p>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-zinc-500">macOS</p>
                  <pre className="overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                    {`/Applications/VLC.app/Contents/MacOS/VLC --network-caching=100 "${monitorUrl}"`}
                  </pre>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-zinc-500">Windows</p>
                  <pre className="overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                    {`"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" --network-caching=100 "${monitorUrl}"`}
                  </pre>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-zinc-500">Linux</p>
                  <pre className="overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                    {`vlc --network-caching=100 "${monitorUrl}"`}
                  </pre>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-zinc-500">ffplay (any OS, lowest latency)</p>
                  <pre className="overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                    {`ffplay -fflags nobuffer -i "${monitorUrl}"`}
                  </pre>
                </div>

                <p className="text-xs text-zinc-500">
                  You can also open the URL in VLC via Media → Open Network Stream, but set
                  Show more options → Caching to ~100ms for low latency.
                </p>
              </div>
            </section>
          </>
        )}

        <Footer />
      </div>
    </div>
  )
}

function replaceBand(bands: EqBand[], index: number, patch: Partial<EqBand>): EqBand[] {
  return bands.map((b, i) => (i === index ? { ...b, ...patch } : b))
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? 'left-4.5' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function Slider({
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
