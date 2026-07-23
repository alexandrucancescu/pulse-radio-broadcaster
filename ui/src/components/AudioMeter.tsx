import { useRef, useEffect, useState, useCallback } from 'react'

type AudioMeterProps = {
  src: string
  label?: string
  className?: string
}

const MIN_DB = -60
const MAX_DB = 0
const SEG_W = 3
const SEG_GAP = 1
const GREEN_DB = -18
const YELLOW_DB = -6
const PEAK_HOLD_FRAMES = 90
const PEAK_FALL = 0.8
const SMOOTH_FALL = 0.8

function dbFrac(db: number) {
  return Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)))
}

function rmsDb(buf: Float32Array) {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)
  return rms > 1e-6 ? 20 * Math.log10(rms) : MIN_DB
}

type Meter = { smooth: number; peak: number; hold: number }

function tickMeter(m: Meter, db: number): Meter {
  const smooth = db > m.smooth ? db : Math.max(MIN_DB, m.smooth - SMOOTH_FALL)
  let { peak, hold } = m
  if (db >= peak) { peak = db; hold = PEAK_HOLD_FRAMES }
  else if (hold > 0) hold--
  else peak = Math.max(MIN_DB, peak - PEAK_FALL)
  return { smooth, peak, hold }
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  db: number, peakDb: number,
) {
  const segs = Math.floor(w / (SEG_W + SEG_GAP))
  const lit = Math.round(dbFrac(db) * segs)
  const peakSeg = Math.min(segs - 1, Math.round(dbFrac(peakDb) * segs))
  const gT = Math.round(dbFrac(GREEN_DB) * segs)
  const yT = Math.round(dbFrac(YELLOW_DB) * segs)

  for (let i = 0; i < segs; i++) {
    const on = i < lit || (i === peakSeg && peakDb > MIN_DB)
    if (i < gT) ctx.fillStyle = on ? '#22c55e' : '#052e16'
    else if (i < yT) ctx.fillStyle = on ? '#eab308' : '#1a1500'
    else ctx.fillStyle = on ? '#ef4444' : '#1c0606'
    ctx.beginPath()
    ctx.roundRect(x + i * (SEG_W + SEG_GAP), y, SEG_W, h, 1)
    ctx.fill()
  }
}

export default function AudioMeter({ src, label, className = '' }: AudioMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{
    audio: HTMLAudioElement
    ctx: AudioContext
    gain: GainNode
    aL: AnalyserNode
    aR: AnalyserNode
  } | null>(null)
  const animRef = useRef(0)
  const meterL = useRef<Meter>({ smooth: MIN_DB, peak: MIN_DB, hold: 0 })
  const meterR = useRef<Meter>({ smooth: MIN_DB, peak: MIN_DB, hold: 0 })

  const [mode, setMode] = useState<'idle' | 'muted' | 'live' | 'error'>('idle')
  const [peakMax, setPeakMax] = useState(MIN_DB)

  const animate = useCallback(() => {
    const bufL = new Float32Array(2048)
    const bufR = new Float32Array(2048)
    let fc = 0

    const tick = () => {
      const s = stateRef.current
      if (!s) return
      const c = canvasRef.current
      // Canvas mounts only once active — keep polling until React commits it,
      // otherwise the loop would die on the idle→running transition.
      if (!c) { animRef.current = requestAnimationFrame(tick); return }
      s.aL.getFloatTimeDomainData(bufL)
      s.aR.getFloatTimeDomainData(bufR)
      meterL.current = tickMeter(meterL.current, rmsDb(bufL))
      meterR.current = tickMeter(meterR.current, rmsDb(bufR))

      if (++fc % 15 === 0) setPeakMax(Math.max(meterL.current.peak, meterR.current.peak))

      const dpr = devicePixelRatio || 1
      const w = c.clientWidth, h = c.clientHeight
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph }
      const g = c.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      const barH = Math.floor((h - 4) / 2)
      drawBar(g, 0, 0, w, barH, meterL.current.smooth, meterL.current.peak)
      drawBar(g, 0, barH + 4, w, barH, meterR.current.smooth, meterR.current.peak)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
  }, [])

  const activate = useCallback(() => {
    if (stateRef.current) return
    const audio = new Audio()
    // Must be set before the resource loads so the fetch uses CORS mode —
    // streams send ACAO *, which lets the analyser read cross-origin samples
    // (needed in dev where the stream is on :3000, not the UI origin).
    audio.crossOrigin = 'anonymous'
    audio.src = src
    const ctx = new AudioContext()
    const source = ctx.createMediaElementSource(audio)
    const splitter = ctx.createChannelSplitter(2)
    const aL = ctx.createAnalyser()
    const aR = ctx.createAnalyser()
    aL.fftSize = 2048; aR.fftSize = 2048
    aL.smoothingTimeConstant = 0; aR.smoothingTimeConstant = 0
    const gain = ctx.createGain()
    gain.gain.value = 0

    source.connect(splitter)
    splitter.connect(aL, 0)
    splitter.connect(aR, 1)
    source.connect(gain)
    gain.connect(ctx.destination)

    stateRef.current = { audio, ctx, gain, aL, aR }

    audio.addEventListener('error', () => setMode('error'))
    ctx.resume()
    audio.play()
      .then(() => { setMode('muted'); animate() })
      .catch(() => setMode('error'))
  }, [src, animate])

  useEffect(() => () => {
    cancelAnimationFrame(animRef.current)
    const s = stateRef.current
    if (s) { s.audio.pause(); s.audio.src = ''; s.ctx.close() }
  }, [])

  const handleClick = useCallback(() => {
    if (mode === 'idle' || mode === 'error') { activate(); return }
    const g = stateRef.current?.gain
    if (!g) return
    if (mode === 'muted') { g.gain.value = 1; setMode('live') }
    else { g.gain.value = 0; setMode('muted') }
  }, [mode, activate])

  // Idle / error: the whole area is the start target, with a centered prompt
  // (no cramped column, uses the empty meter space).
  if (mode === 'idle' || mode === 'error') {
    return (
      <button
        onClick={handleClick}
        className={`group flex w-full items-center justify-center gap-2.5 rounded-lg py-3 text-sm transition-colors ${
          mode === 'error'
            ? 'text-red-400/90 hover:text-red-300'
            : 'text-zinc-400 hover:text-zinc-200'
        } ${className}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-current group-hover:bg-zinc-700 transition-colors">
          {mode === 'error' ? <IconError /> : <IconPlay />}
        </span>
        <span>{mode === 'error' ? 'No signal — click to retry' : 'Click to start monitoring'}</span>
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        onClick={handleClick}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
        title={mode === 'muted' ? 'Unmute' : 'Mute'}
      >
        {mode === 'muted' ? <IconMuted /> : <IconSpeaker />}
      </button>

      <div className="flex flex-1 min-w-0 items-center gap-2">
        <div className="flex flex-col gap-1.5 text-[10px] font-semibold leading-none text-zinc-600 select-none">
          <span>L</span><span>R</span>
        </div>
        <canvas ref={canvasRef} className="flex-1 h-7 rounded" />
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0 w-16">
        <span className={`text-xs font-mono tabular-nums ${
          peakMax > YELLOW_DB ? 'text-red-400' : peakMax > GREEN_DB ? 'text-amber-400' : 'text-zinc-400'
        }`}>
          {peakMax > MIN_DB ? peakMax.toFixed(1) : '—'}
          <span className="text-[10px] text-zinc-600"> dB</span>
        </span>
        {label && <span className="text-[10px] text-zinc-600 truncate max-w-full">{label}</span>}
      </div>
    </div>
  )
}

function IconPlay() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
}
function IconMuted() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="none"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  )
}
function IconSpeaker() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="none"/>
      <path d="M15.54 8.46a5 5 0 010 7.07" fill="none"/><path d="M19.07 4.93a10 10 0 010 14.14" fill="none"/>
    </svg>
  )
}
function IconError() {
  return (
    <svg className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  )
}
