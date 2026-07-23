import type { Logger } from 'pino'
import type ListenerStats from '../../stats/ListenerStats.js'
import type StreamConnections from '../StreamConnections.js'

type Session = {
	lastSeen: number
	remove: () => void
}

/**
 * Listener estimation for stateless HLS clients: a session is an ip+ua
 * fingerprint (plus optional ?s= id our own web player can append) that
 * stays alive as long as playlist/segment requests keep arriving.
 *
 * Each session registers as a synthetic StreamConnections entry so the
 * per-IP limit counts HLS listeners uniformly with icecast ones, and as
 * a ListenerStats listener so dashboards/history need no special casing
 * (the 30s persistence rule filters one-shot probes for free).
 *
 * Enforcement is stateless — no blocklist. A NEW fingerprint over the
 * per-IP limit is rejected without creating a session, so every
 * subsequent request re-checks and keeps failing until a slot frees.
 */
export default class HlsSessions {
	private readonly sessions = new Map<string, Session>()
	private readonly timeoutMs: number

	constructor(
		private readonly connections: StreamConnections,
		private readonly listenerStats: ListenerStats,
		private readonly streamPath: string,
		segmentSeconds: number,
		private readonly log: Logger
	) {
		// A healthy player refetches the playlist about every segment
		// duration; ~3 intervals of silence means it's gone
		this.timeoutMs = Math.max(segmentSeconds * 3, 20) * 1000

		const sweeper = setInterval(() => this.sweep(), this.timeoutMs / 2)
		sweeper.unref()
	}

	/**
	 * Register a request against its session, creating one for new
	 * fingerprints. Returns false when a new fingerprint would exceed
	 * the per-IP connection limit (caller responds 429).
	 */
	public touch(
		ip: string,
		userAgent: string | undefined,
		sessionId: string | undefined,
		maxConnectionsPerIp: number
	): boolean {
		const key = `${ip}|${userAgent ?? ''}|${sessionId ?? ''}`

		const existing = this.sessions.get(key)
		if (existing) {
			existing.lastSeen = Date.now()
			return true
		}

		if (
			maxConnectionsPerIp > 0 &&
			this.connections.countForIp(ip) >= maxConnectionsPerIp
		) {
			return false
		}

		const handle = this.connections.add({
			ip,
			streamPath: this.streamPath,
			// Segments are short unary GETs — nothing meaningful queues, so
			// the stalled-listener and budget kicks never target sessions by
			// buffer size. kick() just ends the session (client re-checks).
			buffered: () => 0,
			kick: () => this.drop(key),
		})

		const listenerIdPromise = this.listenerStats.addListener(
			ip,
			this.streamPath,
			userAgent
		)
		listenerIdPromise.then(id => handle.attachListenerId(id))

		this.sessions.set(key, {
			lastSeen: Date.now(),
			remove: () => {
				handle.remove()
				listenerIdPromise.then(id => this.listenerStats.removeListener(id))
			},
		})

		this.log.trace(`HLS session started (${this.sessions.size} active)`)
		return true
	}

	public get count(): number {
		return this.sessions.size
	}

	private drop(key: string) {
		const session = this.sessions.get(key)
		if (!session) return
		this.sessions.delete(key)
		session.remove()
	}

	private sweep() {
		const deadline = Date.now() - this.timeoutMs
		for (const [key, session] of this.sessions) {
			if (session.lastSeen < deadline) {
				this.log.trace('HLS session expired')
				this.drop(key)
			}
		}
	}
}
