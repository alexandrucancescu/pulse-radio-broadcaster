import type EventEmitter from 'node:events'

/**
 * Contract for anything that can put the station on air.
 *
 * Sources normalize at the edge: whatever the transport or codec,
 * 'data' is always bus PCM (s16be interleaved at the configured rate),
 * so the manager can splice between sources freely.
 *
 * Two orthogonal states:
 *  - active:   "I could produce audio right now" (transport alive)
 *  - selected: "I am on air" — the manager calls select()/deselect().
 *    Passive sources (RTP, HTTP ingest) no-op these; sources that cost
 *    something to run (fallback file decoding) only produce while selected.
 *
 * Detection is the source's own job: it understands its transport
 * (RTP no-data window, HTTP socket close) and emits 'active'/'inactive'.
 * Reconnection likewise — the manager never dials anything.
 */
export default interface AudioSource extends EventEmitter {
	readonly name: string
	readonly isActive: boolean
	/**
	 * A keepalive source (silence generator) keeps outputs and listeners
	 * alive but does not count as real content: the station's uptime
	 * still records an interruption while one is on air.
	 */
	readonly isKeepalive?: boolean

	/** Begin trying (bind socket, watch directory). Idempotent. */
	start(): void
	stop(): void

	/** The manager put this source on air — produce 'data' */
	select(): void
	deselect(): void

	on(event: 'data', handler: (chunk: Buffer) => void): this
	on(event: 'active' | 'inactive', handler: () => void): this
}
