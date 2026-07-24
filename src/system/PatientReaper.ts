import type { ChildProcess } from 'node:child_process'
import pidusage from 'pidusage'
import log from '../util/log.js'

// The Patient Reaper follows every ffmpeg we spawn and reports where each one
// is — including the lost souls that were told to die but linger. It NEVER
// kills anything: the spawner that created a process is the only authority on
// ending it (golden rule). The reaper only observes and reports.
//
// Death is learned from the child's own 'exit' event (authoritative, immune to
// PID reuse). CPU/RSS come from pidusage (reads /proc on Linux — no spawn — and
// batches a single `ps` on macOS dev). kill(pid, 0) is a safe liveness probe
// (signal 0 sends nothing, per POSIX) kept as a backstop for entries that were
// registered by PID alone, with no ChildProcess to watch.

export type ProcStatus = 'running' | 'hanging' | 'exited'

/** The shape reported to the dashboard (no live object refs). */
export type TrackedProcess = {
	id: number
	pid: number
	role: string
	label: string
	startedAt: number
	status: ProcStatus
	released: boolean
	exitedAt: number | null
	exitCode: number | null
	cpuPct: number | null
	rssBytes: number | null
}

type Entry = TrackedProcess & { child?: ChildProcess }

export type RegisterInfo = {
	role: string
	label: string
	/** Preferred: the spawned child. Its 'exit' event is the source of truth. */
	child?: ChildProcess
	/** Fallback when there is no ChildProcess to watch (probed via kill 0). */
	pid?: number
}

const DEFAULTS = {
	// How often to sample CPU/RSS and re-check liveness.
	intervalMs: 3000,
	// After a spawner releases a process, how long before a still-alive one is
	// flagged as 'hanging'.
	hangGraceMs: 5000,
	// How long an exited process stays in the report before being pruned.
	keepExitedMs: 30_000,
}

/** Safe existence probe: signal 0 is never delivered, so it cannot kill. */
function isAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (err) {
		// ESRCH = gone; anything else (e.g. EPERM) means it still exists.
		return (err as NodeJS.ErrnoException).code !== 'ESRCH'
	}
}

export class PatientReaper {
	private readonly entries = new Map<number, Entry>()
	private nextId = 1
	private timer: NodeJS.Timeout | null = null
	private sampling = false

	private readonly intervalMs: number
	private readonly hangGraceMs: number
	private readonly keepExitedMs: number
	private readonly releasedAt = new Map<number, number>()

	constructor(opts: Partial<typeof DEFAULTS> = {}) {
		this.intervalMs = opts.intervalMs ?? DEFAULTS.intervalMs
		this.hangGraceMs = opts.hangGraceMs ?? DEFAULTS.hangGraceMs
		this.keepExitedMs = opts.keepExitedMs ?? DEFAULTS.keepExitedMs
	}

	/**
	 * A spawner registers its process. Returns an id used to release it later,
	 * or -1 if registration failed. This runs on the encoder's hot path, so it
	 * is wrapped: a reaper bug must never propagate into the audio pipeline.
	 */
	register(info: RegisterInfo): number {
		try {
			const pid = info.child?.pid ?? info.pid ?? 0
			const id = this.nextId++

			const entry: Entry = {
				id,
				pid,
				role: info.role,
				label: info.label,
				startedAt: Date.now(),
				status: pid > 0 ? 'running' : 'exited',
				released: false,
				exitedAt: pid > 0 ? null : Date.now(),
				exitCode: null,
				cpuPct: null,
				rssBytes: null,
				child: info.child,
			}
			this.entries.set(id, entry)

			if (info.child) {
				// The child's own exit is authoritative — no PID-reuse ambiguity.
				info.child.once('exit', code => {
					try {
						this.markExited(id, code)
					} catch (err) {
						log.error(err, 'Patient Reaper: markExited failed (ignored)')
					}
				})
			} else if (pid <= 0) {
				log.warn({ role: info.role, label: info.label }, 'Reaper: registered with no pid')
			}

			return id
		} catch (err) {
			log.error(err, 'Patient Reaper: register failed (ignored)')
			return -1
		}
	}

	/**
	 * The spawner declares it is done with this process (it has issued its own
	 * kill, or knows it should be gone). The reaper does not act — but if the
	 * process is still alive after the grace window it is flagged 'hanging'.
	 * Also wrapped: it runs from the encoder's stop() path.
	 */
	release(id: number): void {
		try {
			const entry = this.entries.get(id)
			if (!entry || entry.status === 'exited') return
			entry.released = true
			this.releasedAt.set(id, Date.now())
		} catch (err) {
			log.error(err, 'Patient Reaper: release failed (ignored)')
		}
	}

	private markExited(id: number, code: number | null): void {
		const entry = this.entries.get(id)
		if (!entry || entry.status === 'exited') return
		entry.status = 'exited'
		entry.exitedAt = Date.now()
		entry.exitCode = code
		entry.cpuPct = null
		entry.rssBytes = null
		entry.child = undefined
	}

	start(): void {
		if (this.timer) return
		this.timer = setInterval(() => void this.sample(), this.intervalMs)
		// Never keep the event loop alive just for monitoring.
		this.timer.unref?.()
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}

	/** Snapshot for the stats route — plain data, no child refs. */
	snapshot(): TrackedProcess[] {
		return [...this.entries.values()]
			.map(({ child: _child, ...rest }) => rest)
			.sort((a, b) => a.startedAt - b.startedAt)
	}

	private async sample(): Promise<void> {
		if (this.sampling) return
		this.sampling = true
		try {
			const now = Date.now()

			// Prune long-exited entries so the report stays current.
			for (const entry of this.entries.values()) {
				if (entry.status === 'exited' && entry.exitedAt && now - entry.exitedAt > this.keepExitedMs) {
					this.entries.delete(entry.id)
					this.releasedAt.delete(entry.id)
				}
			}

			const live = [...this.entries.values()].filter(e => e.status !== 'exited')

			// Liveness for PID-only entries (no exit event to rely on), plus the
			// hanging check for anything a spawner has released.
			for (const entry of live) {
				if (!entry.child && !isAlive(entry.pid)) {
					this.markExited(entry.id, null)
					continue
				}
				const releasedAt = this.releasedAt.get(entry.id)
				if (releasedAt && now - releasedAt > this.hangGraceMs) entry.status = 'hanging'
			}

			// Sample CPU/RSS. Per-pid + allSettled so one dead pid can't sink the
			// batch (on Linux each is a cheap /proc read, no spawn).
			const sampleable = live.filter(e => e.status !== 'exited' && e.pid > 0)
			await Promise.all(
				sampleable.map(async entry => {
					try {
						const usage = await pidusage(entry.pid)
						entry.cpuPct = Math.round(usage.cpu * 10) / 10
						entry.rssBytes = usage.memory
					} catch {
						// pidusage fails on a vanished pid; for PID-only entries that
						// confirms death (child-backed ones wait for their exit event).
						if (!entry.child) this.markExited(entry.id, null)
					}
				}),
			)
		} catch (err) {
			log.error(err, 'Patient Reaper sample failed')
		} finally {
			this.sampling = false
		}
	}
}

// Singleton, following the `log` / `configStore` convention — spawners import
// this directly and register their children.
const reaper = new PatientReaper()
export default reaper
