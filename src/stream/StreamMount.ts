import AudioEncoder, { InputFormat, OutputFormat } from '../encoders/AudioEncoder.js'
import BurstBuffer from '././BurstBuffer.js'
import createEncoder from '../encoders/createEncoder.js'
import { Logger } from 'pino'
import OggBurstBuffer from './OggBurstBuffer.js'
import type { StreamConfig } from '../env.js'

export type MountConfig = {
	encoder: OutputFormat
	paths: string[]
	burstSize?: number
	contentType?: string
	headers?: Record<string, string>
	icyMetadata?: boolean
}

export type Consumer = {
	onData: (chunk: Buffer) => void
	onEnd: () => void
}

const DEFAULT_BURST_SEC = 6

function toMountConfig(stream: StreamConfig): MountConfig {
	return {
		encoder: {
			format: stream.format,
			bitrate: stream.bitrate,
			channels: stream.channels,
			codec: stream.codec,
			sampleRate: stream.sampleRate,
			options: stream.options,
		},
		paths: stream.paths,
		burstSize: stream.burstSize,
		contentType: stream.contentType,
		headers: stream.headers,
		icyMetadata: stream.icyMetadata,
	}
}

class StreamMount {
	private readonly burst: BurstBuffer | OggBurstBuffer
	private readonly log: Logger
	public readonly encoder: AudioEncoder
	public readonly config: MountConfig
	public readonly consumers: Set<Consumer>

	constructor(inputFormat: InputFormat, streamConfig: StreamConfig, log: Logger) {
		this.config = toMountConfig(streamConfig)
		this.log = log
		this.consumers = new Set()

		this.encoder = createEncoder(inputFormat, this.config.encoder, log)

		const burstSize = this.config.burstSize ?? this.encoder.bitRateBytes * DEFAULT_BURST_SEC

		const BurstBufferClass =
			this.config.encoder.format === 'opus' ? OggBurstBuffer : BurstBuffer

		this.burst = new BurstBufferClass(burstSize, log)

		log.info(
			`Burst: ${burstSize} bytes ~= ${(burstSize / this.encoder.bitRateBytes).toFixed(1)} seconds` +
				` | ${this.config.encoder.format} ${this.encoder.bitRate}kbps`
		)

		this.encoder.on('restart', () => {
			this.burst.clear()
		})

		this.encoder.on('data', chunk => {
			this.burst.write(chunk)
			this.consumers.forEach(consumer => consumer.onData(chunk))
		})
	}

	public addConsumer(consumer: Consumer) {
		this.consumers.add(consumer)

		const burst = this.burstBuffer

		this.log.trace(`Writing burst ${burst.length} bytes`)

		consumer.onData(burst)
	}

	public removeConsumer(consumer: Consumer) {
		this.consumers.delete(consumer)
	}

	public get burstBuffer(): Buffer {
		return this.burst.burstBuffer
	}

	public get isActive(): boolean {
		return this.encoder.isRunning
	}

	public start() {
		this.encoder.start()
	}

	public stop() {
		this.burst.clear()
		this.encoder.stop()
		this.consumers.forEach(consumer => consumer.onEnd())
	}
}

export default StreamMount
