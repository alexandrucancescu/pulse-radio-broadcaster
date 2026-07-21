import EventEmitter from 'node:events'
import type AudioSource from './AudioSource.js'
import log from '../util/log.js'

export type Interruption = {
	start: number
	end?: number
}

declare interface SourceManager extends EventEmitter {
	on(event: 'data', handler: (chunk: Buffer) => void): this
	on(event: 'active' | 'inactive', handler: () => void): this
	on(event: 'switch', handler: (name: string | null) => void): this
}

/**
 * Owns the source priority chain and decides who is on air.
 * Pure policy loop: highest-priority active source wins; sources detect
 * their own failures and emit 'active'/'inactive', the manager only
 * reacts. Emits the single PCM bus ('data') the DSP chain consumes.
 *
 * Also the station's uptime authority: "on air" is a source-side fact
 * (some source is active), independent of any particular output.
 *
 * A defensive watchdog backs up source self-reporting: if the selected
 * source claims active but produces nothing for well beyond the normal
 * detection window, it is treated as inactive anyway — dead air must be
 * structurally impossible, not dependent on every source's correctness.
 */
class SourceManager extends EventEmitter {
	// Watchdog fires at 2× the largest source detection window so it can
	// never race a source's own (faster, smarter) detection
	private static readonly WATCHDOG_FACTOR = 2

	private readonly sources: AudioSource[]
	private selected: AudioSource | null = null
	// Someone (even the silence keepalive) is feeding the outputs
	private feeding = false
	// Real content is on air — keepalive sources don't count; this is
	// what uptime tracking records
	private up = true
	// A higher-priority source recovered while a working fallback is on
	// air: switch back only after it proves stable (no flapping)
	private pending: { source: AudioSource; timer: NodeJS.Timeout } | null = null

	private readonly startedAt = Date.now()
	private readonly interruptions: Interruption[] = []
	private lastDataTime = Date.now()
	private readonly watchdogWindowMs: number
	private readonly switchBackDelayMs: number

	/** @param sources in priority order, highest first */
	constructor(
		sources: AudioSource[],
		watchdogBaseSeconds: number,
		switchBackDelaySec = 15
	) {
		super()
		this.sources = sources
		this.watchdogWindowMs =
			watchdogBaseSeconds * 1000 * SourceManager.WATCHDOG_FACTOR
		this.switchBackDelayMs = switchBackDelaySec * 1000
	}

	public start() {
		for (const source of this.sources) {
			source.on('data', chunk => {
				if (source !== this.selected) return
				this.lastDataTime = Date.now()
				this.emit('data', chunk)
			})

			source.on('active', () => this.reselect())
			source.on('inactive', () => this.reselect())

			source.start()
		}

		this.reselect()
		this.initWatchdog()
	}

	private reselect() {
		if (this.pending && !this.pending.source.isActive) this.cancelPending()

		const next = this.sources.find(source => source.isActive) ?? null

		if (next === this.selected) {
			this.updateStates()
			return
		}

		// Upgrade: current source still works, a better one came back —
		// hold the switch until the newcomer is stable
		if (next !== null && this.selected !== null && this.selected.isActive) {
			if (this.pending?.source === next) return

			this.cancelPending()

			log.info(
				`Source '${next.name}' recovered — switching back in ${Math.round(this.switchBackDelayMs / 1000)}s if stable`
			)

			const timer = setTimeout(() => {
				this.pending = null
				const candidate = this.sources.find(source => source.isActive) ?? null
				if (candidate !== this.selected) this.switchTo(candidate)
			}, this.switchBackDelayMs)
			timer.unref()

			this.pending = { source: next, timer }
			return
		}

		// Downgrade or first selection: the current source is gone, act now
		this.cancelPending()
		this.switchTo(next)
	}

	private switchTo(next: AudioSource | null) {
		this.selected?.deselect()
		next?.select()
		this.selected = next
		this.lastDataTime = Date.now()

		log.info(`On air: ${next?.name ?? 'nothing — all sources down'}`)
		this.emit('switch', next?.name ?? null)

		this.updateStates()
	}

	private cancelPending() {
		if (!this.pending) return
		clearTimeout(this.pending.timer)
		this.pending = null
	}

	/**
	 * Two separate notions derive from the selection:
	 * - feeding: outputs receive audio (encoders keep running for the
	 *   silence keepalive too) — drives 'active'/'inactive'
	 * - up: real content is on air — drives uptime bookkeeping
	 */
	private updateStates() {
		const feeding = this.selected !== null
		if (feeding !== this.feeding) {
			this.feeding = feeding
			this.emit(feeding ? 'active' : 'inactive')
		}

		const up = this.selected !== null && !this.selected.isKeepalive
		if (up !== this.up) {
			this.up = up

			if (up) {
				const current = this.interruptions[this.interruptions.length - 1]
				if (current && !current.end) current.end = Date.now()
			} else {
				this.interruptions.push({ start: Date.now() })
			}
		}
	}

	private initWatchdog() {
		setInterval(() => {
			if (!this.selected) return

			if (Date.now() - this.lastDataTime > this.watchdogWindowMs) {
				log.error(
					`Watchdog: selected source '${this.selected.name}' claims active but produced no data for ${Math.round(this.watchdogWindowMs / 1000)}s — failing over`
				)
				// The liar stays "active" by its own account, so exclude it
				// explicitly and fail over to the next working source
				const fallback =
					this.sources.find(
						source => source !== this.selected && source.isActive
					) ?? null
				this.switchTo(fallback)
			}
		}, 1000).unref()
	}

	public getUptime() {
		const now = Date.now()

		const computeForWindow = (windowMs: number) => {
			const windowStart = now - windowMs
			let downtime = 0

			for (const i of this.interruptions) {
				const start = Math.max(i.start, windowStart)
				const end = i.end ? Math.min(i.end, now) : now
				if (start < end) downtime += end - start
			}

			const elapsed = Math.min(now - this.startedAt, windowMs)
			if (elapsed <= 0) return 100
			return ((elapsed - downtime) / elapsed) * 100
		}

		return {
			startedAt: this.startedAt,
			isUp: this.up,
			onAir: this.selected?.name ?? null,
			uptime1h: computeForWindow(60 * 60 * 1000),
			uptime24h: computeForWindow(24 * 60 * 60 * 1000),
			uptime7d: computeForWindow(7 * 24 * 60 * 60 * 1000),
			uptime30d: computeForWindow(30 * 24 * 60 * 60 * 1000),
			interruptions: this.interruptions.slice(-20),
		}
	}
}

export default SourceManager
