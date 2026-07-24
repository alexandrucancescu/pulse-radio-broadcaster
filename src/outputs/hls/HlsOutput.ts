import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Logger } from 'pino'
import type { StreamConfig } from '../../config/schema.js'
import type AudioOutput from '../AudioOutput.js'
import type { AnyFastifyInstance, OutputRouteDeps, OutputTap } from '../AudioOutput.js'
import type AudioEncoder from '../encoders/AudioEncoder.js'
import type { InputFormat } from '../encoders/AudioEncoder.js'
import createEncoder from '../encoders/createEncoder.js'
import { config } from '../../config/ConfigStore.js'
import AdtsSegmenter, { HlsSegment } from './AdtsSegmenter.js'
import HlsSessions from './HlsSessions.js'

const DEFAULT_SEGMENT_SECONDS = 6
const DEFAULT_WINDOW_SEGMENTS = 5

// HLS with raw (unmuxed) segments supports AAC elementary streams —
// opus would need fMP4 muxing, deliberately out of scope
const ADTS_FORMATS = new Set(['adts', 'aac', 'aac_he', 'aac_he_v2'])

/**
 * HLS delivery as a peer AudioOutput: own ADTS encoder, in-memory
 * segmenter cutting raw-AAC segments on frame boundaries (no TS/fMP4
 * muxing, no disk), sliding playlist window. Segments are kept one
 * extra window after leaving the playlist for laggard clients.
 *
 * On source loss the playlist ends with #EXT-X-ENDLIST over the
 * remaining window instead of 503ing — combined with client-side
 * buffering this makes short restarts invisible to HLS listeners.
 */
class HlsOutput implements AudioOutput {
	public readonly tap: OutputTap = 'live'

	private readonly log: Logger
	private readonly encoder: AudioEncoder
	private readonly segmenter: AdtsSegmenter
	private readonly mount: string
	private readonly segmentSeconds: number
	private readonly windowSegments: number

	private readonly segments = new Map<number, HlsSegment>()
	private lastSeq = -1
	// #EXT-X-DISCONTINUITY tags that have slid out of the playlist window
	private discontinuitySequence = 0
	private ended = false

	private sessions: HlsSessions | null = null

	constructor(inputFormat: InputFormat, streamConfig: StreamConfig, log: Logger) {
		this.log = log
		this.mount = streamConfig.paths[0].replace(/\/+$/, '')
		this.segmentSeconds = streamConfig.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS
		this.windowSegments = streamConfig.windowSegments ?? DEFAULT_WINDOW_SEGMENTS

		let format = streamConfig.format
		if (!ADTS_FORMATS.has(format)) {
			log.warn(`HLS requires an AAC format, got '${format}' — using 'aac'`)
			format = 'aac'
		}

		this.encoder = createEncoder(
			inputFormat,
			{
				format,
				bitrate: streamConfig.bitrate,
				channels: streamConfig.channels,
				codec: streamConfig.codec,
				sampleRate: streamConfig.sampleRate,
				options: streamConfig.options,
			},
			log,
			{ role: 'hls-encoder', label: this.mount }
		)

		this.segmenter = new AdtsSegmenter(this.segmentSeconds)

		this.encoder.on('data', chunk => this.segmenter.write(chunk))
		this.encoder.on('restart', () => this.segmenter.flush())
		this.segmenter.on('segment', segment => this.addSegment(segment))

		log.info(
			`HLS: ${this.segmentSeconds}s segments, window ${this.windowSegments}` +
				` | ${format} ${streamConfig.bitrate ?? 128}kbps at ${this.mount}/playlist.m3u8`
		)
	}

	public get name(): string {
		return this.mount
	}

	public get playlistPath(): string {
		return `${this.mount}/playlist.m3u8`
	}

	public get isActive(): boolean {
		return this.encoder.isRunning
	}

	public get format(): string {
		return this.encoder.format
	}

	public get bitrate(): number {
		return this.encoder.bitRate
	}

	public get listenerCount(): number {
		return this.sessions?.count ?? 0
	}

	public start() {
		this.encoder.start()
	}

	public stop() {
		this.encoder.stop()
		// Serve the partial tail — with ENDLIST the playlist stays valid
		this.segmenter.flush()
	}

	public write(chunk: Buffer) {
		if (this.encoder.isRunning) this.encoder.write(chunk)
	}

	public setSourceActive(active: boolean) {
		this.ended = !active
		if (active) {
			if (!this.encoder.isRunning) this.start()
		} else {
			this.stop()
		}
	}

	private addSegment(segment: HlsSegment) {
		this.segments.set(segment.seq, segment)
		this.lastSeq = segment.seq

		// The segment sliding out of the playlist window takes its
		// discontinuity tag with it — the media-sequence bookkeeping
		// clients need to keep tag positions stable across refreshes
		const exiting = this.segments.get(segment.seq - this.windowSegments)
		if (exiting?.discontinuity) this.discontinuitySequence++

		// Grace: keep one extra window for clients still draining the old playlist
		const minKeep = segment.seq - this.windowSegments * 2 + 1
		for (const seq of this.segments.keys()) {
			if (seq < minKeep) this.segments.delete(seq)
		}
	}

	private buildPlaylist(): string {
		const first = Math.max(0, this.lastSeq - this.windowSegments + 1)

		const window: HlsSegment[] = []
		for (let seq = first; seq <= this.lastSeq; seq++) {
			const segment = this.segments.get(seq)
			if (segment) window.push(segment)
		}

		const targetDuration = Math.ceil(
			Math.max(this.segmentSeconds, ...window.map(s => s.duration))
		)

		const lines = [
			'#EXTM3U',
			'#EXT-X-VERSION:3',
			`#EXT-X-TARGETDURATION:${targetDuration}`,
			`#EXT-X-MEDIA-SEQUENCE:${first}`,
		]

		if (this.discontinuitySequence > 0) {
			lines.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${this.discontinuitySequence}`)
		}

		for (const segment of window) {
			if (segment.discontinuity) lines.push('#EXT-X-DISCONTINUITY')
			lines.push(`#EXTINF:${segment.duration.toFixed(3)},`)
			lines.push(`${segment.seq}.aac`)
		}

		if (this.ended) lines.push('#EXT-X-ENDLIST')

		return lines.join('\n') + '\n'
	}

	public registerRoutes(app: AnyFastifyInstance, deps: OutputRouteDeps) {
		this.sessions = new HlsSessions(
			deps.connections,
			deps.listenerStats,
			this.mount,
			this.segmentSeconds,
			deps.log
		)

		// Segments are immutable once cut; cache for their in-memory lifetime
		const segmentCacheControl = `public, max-age=${this.segmentSeconds * this.windowSegments * 2}, immutable`

		// Returns false after replying 403/429 — request must stop
		const admit = (req: FastifyRequest, reply: FastifyReply): boolean => {
			const server = config().server

			const blockedAgents = server.blockedUserAgents
			const ua = req.headers['user-agent']
			if (
				blockedAgents.length > 0 &&
				blockedAgents.some(blocked =>
					(ua ?? '').toLowerCase().includes(blocked.toLowerCase())
				)
			) {
				reply.status(403).send({ error: 'Forbidden' })
				return false
			}

			const sessionId = (req.query as Record<string, string | undefined>).s
			if (!this.sessions!.touch(req.ip, ua, sessionId, server.maxConnectionsPerIp)) {
				deps.log.info(`Rejecting HLS request from ${req.ip}: per-IP limit reached`)
				reply.status(429).header('Retry-After', '60').send({
					error: 'Too many connections from this IP',
				})
				return false
			}

			return true
		}

		app.get(`${this.mount}/playlist.m3u8`, (req, reply) => {
			if (!admit(req, reply)) return

			if (this.lastSeq < 0) {
				reply
					.status(503)
					.header('Retry-After', String(this.segmentSeconds))
					.send({ error: 'Stream not active' })
				return
			}

			reply
				.header('Content-Type', 'application/vnd.apple.mpegurl')
				.header('Cache-Control', 'no-store')
				.header('Access-Control-Allow-Origin', '*')
				.send(this.buildPlaylist())
		})

		app.get(`${this.mount}/:file`, (req, reply) => {
			const match = /^(\d+)\.aac$/.exec(
				(req.params as Record<string, string>).file
			)
			if (!match) {
				reply.status(404).send({ error: 'Not found' })
				return
			}

			if (!admit(req, reply)) return

			const segment = this.segments.get(Number(match[1]))
			if (!segment) {
				reply.status(404).send({ error: 'Segment expired' })
				return
			}

			reply
				.header('Content-Type', 'audio/aac')
				.header('Cache-Control', segmentCacheControl)
				.header('Access-Control-Allow-Origin', '*')
				// Keeps reverse proxies (Traefik/nginx/CF) from compressing audio
				.header('Content-Encoding', 'identity')
				.send(segment.data)
		})
	}
}

export default HlsOutput
