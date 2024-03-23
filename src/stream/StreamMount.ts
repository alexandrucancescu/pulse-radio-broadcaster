import EventEmitter from 'node:events'
import AudioEncoder, { InputFormat, OutputFormat } from '../encoders/AudioEncoder.js'
import BurstBuffer from '././BurstBuffer.js'
import createEncoder from '../encoders/createEncoder.js'
import { Logger } from 'pino'
import OggBurstBuffer from './OggBurstBuffer.js'

export type StreamConfig = {
	encoder: OutputFormat
	paths: string[]
	burstSize?: number
	contentType?: string
	headers?: Record<string, string>
}

export type Consumer = {
	onData: (chunk: Buffer) => void
	onEnd: () => void
}

//Default burst buffer in seconds
const DEFAULT_BURST_SEC = 6

//todo change event emitter to custom listener handler
class StreamMount {
	private readonly burst: BurstBuffer | OggBurstBuffer
	private readonly log: Logger
	public readonly encoder: AudioEncoder
	public readonly config: StreamConfig
	public readonly consumers: Set<Consumer>

	constructor(inputFormat: InputFormat, config: StreamConfig, log: Logger) {
		this.config = config
		this.log = log
		this.consumers = new Set()

		this.encoder = createEncoder(inputFormat, config.encoder, log)

		const burstSize = config.burstSize ?? this.encoder.bitRateBytes * DEFAULT_BURST_SEC

		const BurstBufferClass =
			config.encoder.format === 'opus' ? OggBurstBuffer : BurstBuffer

		//todo allow burst size in seconds
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
