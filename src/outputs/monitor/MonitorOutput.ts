import { ServerResponse } from 'node:http'

import { Logger } from 'pino'
import { timingSafeEqual } from 'node:crypto'
import { createWavStreamHeader } from '../../util/wav.js'
import { monitorToken } from '../../util/auth.js'
import userStore from '../../auth/UserStore.js'
import type AudioOutput from '../AudioOutput.js'
import type { OutputTap, AnyFastifyInstance } from '../AudioOutput.js'

/**
 * Low-latency monitor output for DSP tuning: serves the post-DSP PCM
 * as an endless WAV over HTTP with NO burst buffer and NO encoder, so
 * players hear the chain with only their own network buffering:
 *
 *   ffplay -fflags nobuffer -i http://user:pass@host:3000/monitor.wav
 *   vlc --network-caching=100 http://user:pass@host:3000/monitor.wav
 *
 * Taps 'preview': once a separate preview DSP chain exists (EQ
 * preview/commit workflow), this is the output that plays it.
 */
// Kick monitor clients buffered more than this many seconds behind —
// raw PCM is ~176 KB/s, so a stalled client leaks memory fast, and a
// monitor that far behind is useless for live tuning anyway
const MAX_BUFFERED_SECONDS = 5

function isValidToken(candidate: string): boolean {
	const expected = monitorToken()
	if (candidate.length !== expected.length) return false
	return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
}

export default class MonitorOutput implements AudioOutput {
	public readonly name = 'monitor'
	public readonly tap: OutputTap = 'preview'

	private readonly clients = new Set<ServerResponse>()
	private readonly header: Buffer
	private readonly log: Logger
	private readonly maxBufferedBytes: number

	constructor(sampleRate: number, channels: number, log: Logger) {
		this.header = createWavStreamHeader(sampleRate, channels)
		this.log = log
		this.maxBufferedBytes = sampleRate * channels * 2 * MAX_BUFFERED_SECONDS
	}

	public get clientCount(): number {
		return this.clients.size
	}

	public start() {}

	public stop() {
		this.clients.forEach(client => client.destroy())
	}

	// The monitor serves whatever the chain produces, source up or not —
	// hearing the silence is part of monitoring
	public setSourceActive() {}

	public registerRoutes(app: AnyFastifyInstance) {
		// Three ways in, because audio players can't do cookies:
		// ?token= (shown in the DSP page, for ffplay/vlc URLs), the panel
		// session cookie (req.auth, for an in-dashboard player), or Basic
		// user:pass in the URL checked against the panel users.
		app.get('/monitor.wav', async (request, reply) => {
			const token = (request.query as Record<string, string>).token

			if (token) {
				if (!isValidToken(token)) {
					return reply.code(401).send({ error: 'Invalid token' })
				}
			} else if (!request.auth) {
				const auth = request.headers.authorization
				if (!auth?.startsWith('Basic ')) {
					reply.header('WWW-Authenticate', 'Basic realm="monitor"')
					return reply.code(401).send({ error: 'Unauthorized' })
				}
				const decoded = Buffer.from(auth.slice(6), 'base64').toString()
				const colon = decoded.indexOf(':')
				const user = decoded.slice(0, colon)
				const pass = decoded.slice(colon + 1)
				if (!userStore.verify(user, pass)) {
					reply.header('WWW-Authenticate', 'Basic realm="monitor"')
					return reply.code(401).send({ error: 'Unauthorized' })
				}
			}

			reply.hijack()

			reply.raw.writeHead(200, {
				'Content-Type': 'audio/wav',
				'Cache-Control': 'no-store, no-cache',
				'Access-Control-Allow-Origin': '*',
			})

			this.addClient(reply.raw)
		})
	}

	public addClient(res: ServerResponse) {
		res.write(this.header)
		this.clients.add(res)

		this.log.info(`Monitor client connected (${this.clients.size} total)`)

		res.on('close', () => {
			this.clients.delete(res)
			this.log.info(`Monitor client disconnected (${this.clients.size} total)`)
		})
	}

	public write(chunk: Buffer) {
		if (this.clients.size === 0) return

		// WAV is little-endian; the pipeline is s16be. swap16 mutates,
		// so work on a copy and drop a trailing odd byte if one ever
		// appears (never happens with frame-aligned pipeline chunks).
		const evenLength = chunk.length - (chunk.length % 2)
		const littleEndian = Buffer.from(chunk.subarray(0, evenLength))
		littleEndian.swap16()

		this.clients.forEach(client => {
			if (client.closed || client.destroyed) return

			if (client.writableLength > this.maxBufferedBytes) {
				this.log.info(
					`Kicking stalled monitor client (${client.writableLength} bytes buffered)`
				)
				// destroy() emits 'close', which removes it from the set
				client.destroy()
				return
			}

			client.write(littleEndian)
		})
	}
}
