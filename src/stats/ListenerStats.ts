import { lookup as ipLookup } from 'fast-geoip'
import { lookup as uaLookup } from 'useragent'
import type { Db } from '../db/index.js'
import { listenerSessions } from '../db/schema.js'

const MAX_LISTENERS_PER_IP = 5
const MIN_SESSION_DURATION_S = 30

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
}

export default class ListenerStats {
	private readonly listeners: Listener[]
	private readonly ipCounts: Map<string, number>
	private readonly db: Db | null

	private currentId = 0

	constructor(db?: Db) {
		this.listeners = []
		this.ipCounts = new Map()
		this.db = db ?? null
	}

	public async addListener(
		ip: string,
		streamPath: string,
		userAgent?: string,
		referer?: string
	): Promise<number> {
		const currentCount = this.ipCounts.get(ip) ?? 0

		const listener: Listener = {
			id: this.getNextId(),
			ip,
			streamPath,
			referer,
			refererDomain: parseRefererDomain(referer),
			startTime: Date.now(),
		}

		if (currentCount < MAX_LISTENERS_PER_IP) {
			const geolocation = await ipLookup(ip)

			if (geolocation) {
				listener.geolocation = {
					country: geolocation.country,
					region: geolocation.region,
				}
			}
		}

		if (userAgent) {
			const parsedUa = uaLookup(userAgent)
			listener.userAgent = {
				family: parsedUa.family,
				major: parsedUa.major,
			}
		}

		this.listeners.push(listener)
		this.ipCounts.set(ip, currentCount + 1)

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

			this.persistSession(listener)
		}
	}

	private persistSession(listener: Listener) {
		if (!this.db) return

		const now = new Date()
		const durationS = Math.round((now.getTime() - listener.startTime) / 1000)
		if (durationS < MIN_SESSION_DURATION_S) return

		try {
			this.db.drizzle.insert(listenerSessions).values({
				ip: listener.ip,
				country: listener.geolocation?.country ?? null,
				referer: listener.refererDomain ?? null,
				stream: listener.streamPath,
				connectedAt: new Date(listener.startTime),
				disconnectedAt: now,
				durationS,
			}).run()
		} catch {
			// Best-effort — don't crash the listener cleanup path
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

	public getListenerCount(): number {
		let count = 0
		for (const n of this.ipCounts.values()) {
			count += Math.min(n, MAX_LISTENERS_PER_IP)
		}
		return count
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
		return this.db.sqlite.prepare(`
			SELECT ip, SUM(duration_s) AS totalSeconds, COUNT(*) AS sessions
			FROM listener_sessions
			WHERE connected_at >= ?
			GROUP BY ip ORDER BY totalSeconds DESC LIMIT 20
		`).all(since) as { ip: string; totalSeconds: number; sessions: number }[]
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

	public getPeakConcurrent() {
		if (!this.db) return null

		// Find the moment with the most overlapping sessions
		// For each session start/end, count how many sessions were active at that point
		const row = this.db.sqlite.prepare(`
			WITH events AS (
				SELECT connected_at AS ts, 1 AS delta FROM listener_sessions
				UNION ALL
				SELECT disconnected_at AS ts, -1 AS delta FROM listener_sessions
			),
			running AS (
				SELECT ts, SUM(SUM(delta)) OVER (ORDER BY ts) AS concurrent
				FROM events
				GROUP BY ts
			)
			SELECT concurrent AS peak, ts
			FROM running
			ORDER BY concurrent DESC
			LIMIT 1
		`).get() as { peak: number; ts: number } | undefined

		if (!row) return null
		return { peak: row.peak, at: new Date(row.ts * 1000).toISOString() }
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
