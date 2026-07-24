import { useRef, useEffect, useState, useCallback } from 'react'

type AudioMeterProps = {
  src: string
  label?: string
  className?: string
  // When idle, draw attention: animated colored bars + a glowing enable button.
  attention?: boolean
  // Fires once the user actually starts monitoring (used to stop hinting).
  onActivate?: () => void
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

export default function AudioMeter({ src, label, className = '', attention = false, onActivate }: AudioMeterProps) {
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
      .then(() => { setMode('muted'); animate(); onActivate?.() })
      .catch(() => setMode('error'))
  }, [src, animate, onActivate])

  useEffect(() => () => {
    cancelAnimationFrame(animRef.current)
    const s = stateRef.current
    if (s) { s.audio.pause(); s.audio.src = ''; s.ctx.close() }
  }, [])

  // Tear the audio graph down and return to the dead state, re-activatable.
  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    const s = stateRef.current
    if (s) { s.audio.pause(); s.audio.src = ''; s.ctx.close() }
    stateRef.current = null
    meterL.current = { smooth: MIN_DB, peak: MIN_DB, hold: 0 }
    meterR.current = { smooth: MIN_DB, peak: MIN_DB, hold: 0 }
    setPeakMax(MIN_DB)
    setMode('idle')
  }, [])

  const handleClick = useCallback(() => {
    if (mode === 'idle' || mode === 'error') { activate(); return }
    const g = stateRef.current?.gain
    if (!g) return
    if (mode === 'muted') { g.gain.value = 1; setMode('live') }
    else { g.gain.value = 0; setMode('muted') }
  }, [mode, activate])

  // Idle / error: a dead skeleton meter + prompt. The whole row is the start
  // target. Layout mirrors the active state so enabling causes no shift.
  if (mode === 'idle' || mode === 'error') {
    const isErr = mode === 'error'
    const hint = attention && !isErr
    return (
      <button
        onClick={handleClick}
        className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg text-left ${className}`}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all duration-200 group-hover:scale-105 ${
          isErr
            ? 'bg-red-950/60 text-red-400'
            : `text-zinc-500 group-hover:bg-zinc-700 group-hover:text-zinc-100 ${
                hint ? 'monitor-glow bg-zinc-800 text-zinc-200' : 'bg-zinc-800/40'
              }`
        }`}>
          {isErr ? <IconError /> : <IconPlay />}
        </span>

        {/* Label sits above the bars so it clearly reads as a call to action. */}
        <div className="flex flex-1 min-w-0 flex-col justify-center gap-1.5">
          <span className={`text-sm font-medium transition-colors ${
            isErr ? 'text-red-400/90' : `group-hover:text-zinc-200 ${hint ? 'text-zinc-200' : 'text-zinc-600'}`
          }`}>
            {isErr
              ? 'No signal — click to retry'
              : `Click to enable audio monitoring${label ? ` · ${label}` : ''}`}
          </span>
          {!isErr && (
            <div className="flex flex-col gap-1">
              <SkeletonRow live={hint} />
              <SkeletonRow live={hint} />
            </div>
          )}
        </div>
      </button>
    )
  }

  const muted = mode === 'muted'
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Stage 2: bars are already live; this chip clearly toggles the audio. */}
      <button
        onClick={handleClick}
        className={`flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
          muted
            ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
            : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
        }`}
        title={muted ? 'Unmute — hear the audio' : 'Mute — keep the bars only'}
      >
        {muted ? <IconMuted /> : <IconSpeaker />}
        <span>{muted ? 'Unmute' : 'Mute'}</span>
      </button>

      <div className="flex flex-1 min-w-0 items-center gap-2">
        <div className="flex flex-col gap-2 text-[10px] font-semibold leading-none text-zinc-600 select-none">
          <span>L</span><span>R</span>
        </div>
        <canvas ref={canvasRef} className="flex-1 h-11 rounded" />
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0 w-16">
        <span className={`text-sm font-mono tabular-nums ${
          peakMax > YELLOW_DB ? 'text-red-400' : peakMax > GREEN_DB ? 'text-amber-400' : 'text-zinc-400'
        }`}>
          {peakMax > MIN_DB ? peakMax.toFixed(1) : '—'}
          <span className="text-[10px] text-zinc-600"> dB</span>
        </span>
        {label && <span className="text-[10px] text-zinc-600 truncate max-w-full">{label}</span>}
      </div>

      <button
        onClick={stop}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
        title="Stop monitoring"
      >
        <IconPower />
      </button>
    </div>
  )
}

function SkeletonRow({ live }: { live: boolean }) {
  return <div className={`monitor-bars h-3 rounded ${live ? 'is-live' : ''}`} />
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
function IconPower() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  )
}
