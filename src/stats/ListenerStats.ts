import { lookup as ipLookup } from 'fast-geoip'
import { lookup as uaLookup } from 'useragent'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { listenerSessions, meta } from '../db/schema.js'

const MIN_SESSION_DURATION_S = 30
// Bound the per-IP geolocation cache; evicts oldest entries beyond this
const GEO_CACHE_MAX = 1000

export type MemoryUsage = {
	rss: number
	heapUsed: number
	heapTotal: number
	external: number
	arrayBuffers: number
}

export type Listener = {
	id: number
	ip: string
	geolocation?: {
		country: string
		region: string
	}
	referer?: string
	refererDomain?: string
	userAgent?: {
		family: string
		major: string
	}
	startTime: number
	streamPath: string
	// Row id in listener_sessions once the session has been persisted
	// (30s after connect); undefined before that
	dbId?: number
}

export default class ListenerStats {
	private readonly listeners: Listener[]
	private readonly ipCounts: Map<string, number>
	// One geo lookup per IP: repeated connects (NAT groups, directory
	// probers) reuse the cached result instead of re-reading the geo db
	private readonly geoCache: Map<string, Listener['geolocation'] | null>
	private readonly db: Db | null
	// Pending insert timers keyed by listener id, cancelled on early disconnect.
	// Kept outside Listener because those objects cross the worker RPC boundary
	private readonly persistTimers: Map<number, NodeJS.Timeout>

	private currentId = 0

	// All-time record, tracked live on every connect and persisted to the
	// meta table only when the record breaks. Survives restarts and the
	// 1-year session retention
	private peakConcurrent: { peak: number; at: string } | null = null

	constructor(db?: Db) {
		this.listeners = []
		this.ipCounts = new Map()
		this.geoCache = new Map()
		this.db = db ?? null
		this.persistTimers = new Map()
		this.peakConcurrent = this.loadPeakConcurrent()
	}

	public async addListener(
		ip: string,
		streamPath: string,
		userAgent?: string,
		referer?: string
	): Promise<number> {
		const listener: Listener = {
			id: this.getNextId(),
			ip,
			streamPath,
			referer,
			refererDomain: parseRefererDomain(referer),
			startTime: Date.now(),
		}

		const geolocation = await this.lookupGeo(ip)
		if (geolocation) listener.geolocation = geolocation

		if (userAgent) {
			const parsedUa = uaLookup(userAgent)
			listener.userAgent = {
				family: parsedUa.family,
				major: parsedUa.major,
			}
		}

		this.listeners.push(listener)
		// Re-read instead of reusing currentCount: it was captured before the
		// awaited geo lookup, and connects/disconnects for the same IP during
		// that suspension would make a stale increment drift the count
		this.ipCounts.set(ip, (this.ipCounts.get(ip) ?? 0) + 1)

		this.maybeUpdatePeak()

		if (this.db) {
			const timer = setTimeout(() => {
				this.persistTimers.delete(listener.id)
				this.insertSession(listener)
			}, MIN_SESSION_DURATION_S * 1000)
			timer.unref()
			this.persistTimers.set(listener.id, timer)
		}

		return listener.id
	}

	public async removeListener(id: number) {
		const index = this.listeners.findIndex(listener => listener.id === id)

		if (index !== -1) {
			const listener = this.listeners[index]
			this.listeners.splice(index, 1)

			const count = (this.ipCounts.get(listener.ip) ?? 1) - 1
			if (count <= 0) {
				this.ipCounts.delete(listener.ip)
			} else {
				this.ipCounts.set(listener.ip, count)
			}

			const timer = this.persistTimers.get(listener.id)
			if (timer) {
				clearTimeout(timer)
				this.persistTimers.delete(listener.id)
			}

			this.finalizeSession(listener)
		}
	}

	private async lookupGeo(ip: string): Promise<Listener['geolocation'] | null> {
		if (this.geoCache.has(ip)) return this.geoCache.get(ip) ?? null

		const result = await ipLookup(ip)
		const geolocation = result
			? { country: result.country, region: result.region }
			: null

		if (this.geoCache.size >= GEO_CACHE_MAX) {
			// Maps iterate in insertion order — drop the oldest entry
			const oldest = this.geoCache.keys().next().value
			if (oldest !== undefined) this.geoCache.delete(oldest)
		}
		this.geoCache.set(ip, geolocation)

		return geolocation
	}

	/** INSERT the active session 30s after connect, remembering the row id */
	private insertSession(listener: Listener) {
		if (!this.db) return

		try {
			const result = this.db.drizzle.insert(listenerSessions).values({
				ip: listener.ip,
				country: listener.geolocation?.country ?? null,
				referer: listener.refererDomain ?? null,
				stream: listener.streamPath,
				connectedAt: new Date(listener.startTime),
			}).run()

			listener.dbId = Number(result.lastInsertRowid)
		} catch {
			// Best-effort — stats must never break streaming
		}
	}

	/** Set disconnected_at/duration on the row created by insertSession */
	private finalizeSession(listener: Listener) {
		if (!this.db) return

		const now = new Date()
		const durationS = Math.round((now.getTime() - listener.startTime) / 1000)

		try {
			if (listener.dbId !== undefined) {
				this.db.drizzle.update(listenerSessions)
					.set({ disconnectedAt: now, durationS })
					.where(eq(listenerSessions.id, listener.dbId))
					.run()
			} else if (durationS >= MIN_SESSION_DURATION_S) {
				// Disconnect raced the 30s timer — insert the complete row
				this.db.drizzle.insert(listenerSessions).values({
					ip: listener.ip,
					country: listener.geolocation?.country ?? null,
					referer: listener.refererDomain ?? null,
					stream: listener.streamPath,
					connectedAt: new Date(listener.startTime),
					disconnectedAt: now,
					durationS,
				}).run()
			}
		} catch {
			// Best-effort — stats must never break streaming
		}
	}

	private loadPeakConcurrent(): { peak: number; at: string } | null {
		if (!this.db) return null

		try {
			const row = this.db.drizzle.select().from(meta).where(eq(meta.key, 'peak_concurrent')).get()
			return row ? JSON.parse(row.value) : null
		} catch {
			return null
		}
	}

	private maybeUpdatePeak() {
		const current = this.getListenerCount()
		if (current <= (this.peakConcurrent?.peak ?? 0)) return

		this.peakConcurrent = { peak: current, at: new Date().toISOString() }

		if (!this.db) return
		try {
			this.db.drizzle.insert(meta)
				.values({ key: 'peak_concurrent', value: JSON.stringify(this.peakConcurrent) })
				.onConflictDoUpdate({ target: meta.key, set: { value: JSON.stringify(this.peakConcurrent) } })
				.run()
		} catch {
			// Best-effort — stats must never break streaming
		}
	}

	private getNextId(): number {
		if (this.currentId >= Number.MAX_SAFE_INTEGER) {
			this.currentId = 0
		}

		return this.currentId++
	}

	public async getAllListeners(): Promise<Listener[]> {
		return this.listeners
	}

	public getUniqueIpCount(): number {
		return this.ipCounts.size
	}

	// Runs inside the worker thread, so this reports the worker's own heap
	public getMemoryUsage(): MemoryUsage {
		const m = process.memoryUsage()
		return {
			rss: m.rss,
			heapUsed: m.heapUsed,
			heapTotal: m.heapTotal,
			external: m.external,
			arrayBuffers: m.arrayBuffers,
		}
	}

	public getListenerCount(): number {
		// No per-IP capping here: MAX_CONNECTIONS_PER_IP is enforced at
		// connect time, so every tracked listener is a real connection
		return this.listeners.length
	}

	public getListenersByReferer(): Record<string, number> {
		const counts: Record<string, number> = {}
		for (const l of this.listeners) {
			const domain = l.refererDomain ?? 'direct'
			counts[domain] = (counts[domain] ?? 0) + 1
		}
		return counts
	}

	public getListenersByCountry(): Record<string, number> {
		const counts: Record<string, number> = {}
		for (const l of this.listeners) {
			const country = l.geolocation?.country ?? 'Unknown'
			counts[country] = (counts[country] ?? 0) + 1
		}
		return counts
	}

	// ── Historical queries (SQLite) ──────────────────────────────

	public getListenersOverTime(range: '24h' | '7d' | '30d') {
		if (!this.db) return []
		const { since, bucket, format } = rangeConfig(range)
		return this.db.sqlite.prepare(`
			SELECT ${bucket} AS t, COUNT(*) AS count
			FROM listener_sessions
			WHERE connected_at >= ?
			GROUP BY t ORDER BY t
		`).all(since) as { t: string; count: number }[]
	}

	public getListenersByHour() {
		if (!this.db) return []
		return this.db.sqlite.prepare(`
			SELECT CAST(strftime('%H', connected_at, 'unixepoch') AS INTEGER) AS hour,
			       ROUND(CAST(COUNT(*) AS REAL) / MAX(1, CAST((julianday('now') - julianday(MIN(connected_at), 'unixepoch')) AS INTEGER)) ) AS avg
			FROM listener_sessions
			GROUP BY hour ORDER BY hour
		`).all() as { hour: number; avg: number }[]
	}

	public getTopCountries(range: '24h' | '7d' | '30d') {
		if (!this.db) return []
		const { since } = rangeConfig(range)
		return this.db.sqlite.prepare(`
			SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS count
			FROM listener_sessions
			WHERE connected_at >= ?
			GROUP BY country ORDER BY count DESC LIMIT 20
		`).all(since) as { country: string; count: number }[]
	}

	public getTopReferers(range: '24h' | '7d' | '30d') {
		if (!this.db) return []
		const { since } = rangeConfig(range)
		return this.db.sqlite.prepare(`
			SELECT COALESCE(referer, 'direct') AS referer, COUNT(*) AS count
			FROM listener_sessions
			WHERE connected_at >= ?
			GROUP BY referer ORDER BY count DESC LIMIT 20
		`).all(since) as { referer: string; count: number }[]
	}

	public getTopIps(range: '24h' | '7d' | '30d') {
		if (!this.db) return []
		const { since } = rangeConfig(range)
		const now = Math.floor(Date.now() / 1000)
		// Active sessions (NULL duration) count their listening time so far
		return this.db.sqlite.prepare(`
			SELECT ip, SUM(COALESCE(duration_s, ? - connected_at)) AS totalSeconds, COUNT(*) AS sessions
			FROM listener_sessions
			WHERE connected_at >= ?
			GROUP BY ip ORDER BY totalSeconds DESC LIMIT 20
		`).all(now, since) as { ip: string; totalSeconds: number; sessions: number }[]
	}

	public getSessionSummary() {
		if (!this.db) return { today: 0, week: 0, month: 0, avgDurationS: 0 }
		const now = Math.floor(Date.now() / 1000)
		const dayAgo = now - 24 * 60 * 60
		const weekAgo = now - 7 * 24 * 60 * 60
		const monthAgo = now - 30 * 24 * 60 * 60

		const row = this.db.sqlite.prepare(`
			SELECT
				COALESCE(SUM(CASE WHEN connected_at >= ? THEN 1 ELSE 0 END), 0) AS today,
				COALESCE(SUM(CASE WHEN connected_at >= ? THEN 1 ELSE 0 END), 0) AS week,
				COUNT(*) AS month,
				COALESCE(AVG(duration_s), 0) AS avgDurationS
			FROM listener_sessions
			WHERE connected_at >= ?
		`).get(dayAgo, weekAgo, monthAgo) as { today: number; week: number; month: number; avgDurationS: number }

		return row
	}

	public getPeakConcurrent(): { peak: number; at: string } | null {
		return this.peakConcurrent
	}
}

function parseRefererDomain(referer?: string): string | undefined {
	if (!referer) return undefined
	try {
		return new URL(referer).hostname
	} catch {
		return undefined
	}
}

function rangeConfig(range: '24h' | '7d' | '30d') {
	const now = Math.floor(Date.now() / 1000)
	switch (range) {
		case '24h':
			return {
				since: now - 24 * 60 * 60,
				bucket: "strftime('%Y-%m-%d %H:00', connected_at, 'unixepoch')",
				format: 'hour',
			}
		case '7d':
			return {
				since: now - 7 * 24 * 60 * 60,
				bucket: "strftime('%Y-%m-%d', connected_at, 'unixepoch')",
				format: 'day',
			}
		case '30d':
			return {
				since: now - 30 * 24 * 60 * 60,
				bucket: "strftime('%Y-%m-%d', connected_at, 'unixepoch')",
				format: 'day',
			}
	}
}
