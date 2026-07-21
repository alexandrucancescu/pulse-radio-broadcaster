import type { FastifyInstance } from 'fastify'
import type { Logger } from 'pino'

// A Fastify instance regardless of its server/logger generics — outputs
// register plain routes and don't care about the concrete instance type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFastifyInstance = FastifyInstance<any, any, any, any, any>
import type ListenerStats from '../stats/ListenerStats.js'
import type NowPlaying from '../nowPlaying.js'
import type StreamConnections from './StreamConnections.js'

/**
 * Which DSP bus an output consumes. 'live' is the on-air chain feeding
 * listeners; 'preview' is the tuning chain (monitor) — the plumbing the
 * EQ preview/commit workflow builds on. Until a separate preview chain
 * exists, both taps are wired to the live chain in run.ts.
 */
export type OutputTap = 'live' | 'preview'

/** Shared route dependencies handed to every output by the manager */
export type OutputRouteDeps = {
	listenerStats: ListenerStats
	nowPlaying: NowPlaying
	connections: StreamConnections
	log: Logger
}

/**
 * Contract for anything that consumes the station's PCM and delivers it.
 * Mirror of AudioSource: sources normalize into PCM, outputs specialize
 * out of it (encode, mux, segment, serve). The OutputManager knows
 * nothing about codecs or transports — each output brings its own
 * processing and registers its own HTTP endpoints.
 */
export default interface AudioOutput {
	readonly name: string
	readonly tap: OutputTap

	start(): void
	stop(): void

	/** Bus PCM from this output's tap; called by the OutputManager */
	write(chunk: Buffer): void

	/**
	 * The station's source went down/up. Each output decides what that
	 * means for it (icecast: stop encoders; monitor: keep serving).
	 */
	setSourceActive(active: boolean): void

	/** Contribute this output's HTTP endpoints (stream paths, monitor.wav) */
	registerRoutes(app: AnyFastifyInstance, deps: OutputRouteDeps): void
}
