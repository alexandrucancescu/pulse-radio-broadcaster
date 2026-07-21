import EventEmitter from 'node:events'
import type AudioSource from './AudioSource.js'

// Emit 100ms of silence at a time — small enough to keep encoder
// latency negligible, large enough to keep timer overhead irrelevant
const CHUNK_MS = 100

/**
 * The floor of the source priority chain: generates PCM silence
 * in-process, has zero dependencies and cannot fail. While it is on
 * air the encoders keep producing valid frames, listeners stay
 * connected and directories (TuneIn) see the stream as up — dead air
 * is structurally impossible.
 *
 * Marked keepalive: uptime tracking still records an interruption
 * while silence plays, because silence is not content.
 */
class SilenceSource extends EventEmitter implements AudioSource {
	public readonly name = 'silence'
	public readonly isKeepalive = true

	private readonly chunk: Buffer
	private timer: NodeJS.Timeout | null = null

	constructor(sampleRate: number, channels: number) {
		super()
		// s16 = 2 bytes per sample; zero-filled buffer IS digital silence
		this.chunk = Buffer.alloc((sampleRate * channels * 2 * CHUNK_MS) / 1000)
	}

	public get isActive(): boolean {
		return true
	}

	public start() {}

	public stop() {
		this.deselect()
	}

	public select() {
		if (this.timer) return
		this.timer = setInterval(() => this.emit('data', this.chunk), CHUNK_MS)
		this.timer.unref()
	}

	public deselect() {
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}
}

export default SilenceSource
