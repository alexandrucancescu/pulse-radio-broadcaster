import { ServerResponse } from 'node:http'
import { Logger } from 'pino'
import { createWavStreamHeader } from '../util/wav.js'

/**
 * Low-latency monitor output for DSP tuning: serves the post-DSP PCM
 * as an endless WAV over HTTP with NO burst buffer and NO encoder, so
 * players hear the chain with only their own network buffering:
 *
 *   ffplay -fflags nobuffer -i http://user:pass@host:3000/monitor.wav
 *   vlc --network-caching=100 http://user:pass@host:3000/monitor.wav
 *
 * What comes out here is exactly what the stream encoders receive.
 */
export default class MonitorMount {
	private readonly clients = new Set<ServerResponse>()
	private readonly header: Buffer
	private readonly log: Logger

	constructor(sampleRate: number, channels: number, log: Logger) {
		this.header = createWavStreamHeader(sampleRate, channels)
		this.log = log
	}

	public get clientCount(): number {
		return this.clients.size
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
			if (!client.closed) client.write(littleEndian)
		})
	}
}
