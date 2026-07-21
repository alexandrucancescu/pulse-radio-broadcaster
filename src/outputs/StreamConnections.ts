// Single main-thread source of truth for live stream connections.
// Listener metadata lives in the stats worker, but everything that must be
// answered synchronously about a connection — per-IP limiting, buffered
// bytes, the ability to kick — lives here, maintained by one add/remove
// path so the indexes can never drift apart.

export type StreamConnection = {
	ip: string
	streamPath: string
	/** Unsent bytes queued for this connection (response + socket) */
	buffered: () => number
	/** Force-disconnect; must run the normal close/cleanup path */
	kick: () => void
}

export type ConnectionHandle = {
	/** Correlate with the stats worker's listener id once it resolves */
	attachListenerId: (id: number) => void
	remove: () => void
}

export default class StreamConnections {
	private readonly entries = new Set<StreamConnection>()
	private readonly ipCounts = new Map<string, number>()
	private readonly byListenerId = new Map<number, StreamConnection>()

	add(conn: StreamConnection): ConnectionHandle {
		this.entries.add(conn)
		this.ipCounts.set(conn.ip, (this.ipCounts.get(conn.ip) ?? 0) + 1)

		let listenerId: number | undefined

		return {
			attachListenerId: (id: number) => {
				listenerId = id
				this.byListenerId.set(id, conn)
			},
			remove: () => {
				// Idempotent: kicks and client disconnects can race to cleanup
				if (!this.entries.delete(conn)) return

				const count = (this.ipCounts.get(conn.ip) ?? 1) - 1
				if (count <= 0) {
					this.ipCounts.delete(conn.ip)
				} else {
					this.ipCounts.set(conn.ip, count)
				}

				if (listenerId !== undefined) this.byListenerId.delete(listenerId)
			},
		}
	}

	countForIp(ip: string): number {
		return this.ipCounts.get(ip) ?? 0
	}

	bufferedFor(listenerId: number): number | undefined {
		return this.byListenerId.get(listenerId)?.buffered()
	}

	totalBuffered(): number {
		let total = 0
		for (const conn of this.entries) total += conn.buffered()
		return total
	}

	/** Snapshot of connections with their buffer sizes, worst first */
	entriesByBufferedDesc(): { conn: StreamConnection; buffered: number }[] {
		return [...this.entries]
			.map(conn => ({ conn, buffered: conn.buffered() }))
			.sort((a, b) => b.buffered - a.buffered)
	}
}
