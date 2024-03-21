import AudioEncoder, { InputFormat, OutputFormat } from '../encoders/AudioEncoder.js'
import BurstBuffer from '././BurstBuffer.js'
import createEncoder from '../encoders/createEncoder.js'
import { Logger } from 'pino'
import OggBurstBuffer from './OggBurstBuffer.js'
import EventEmitter from 'events'

export type StreamConfig = {
	encoder: OutputFormat
	paths: string[]
	burstSize?: number
	contentType?: string
	headers?: Record<string, string>
}

export type ConsumerHandler = (chunk: Buffer) => void

declare interface StreamMount {
	on(event: 'data', handler: (chunk: Buffer) => void): this
	on(event: 'end', handler: () => void): this
}

class StreamMount extends EventEmitter {
	private readonly buffer: BurstBuffer | OggBurstBuffer
	public readonly encoder: AudioEncoder
	public readonly config: StreamConfig
	public readonly consumers: ConsumerHandler[]

	constructor(inputFormat: InputFormat, config: StreamConfig, log: Logger) {
		super()
		this.config = config
		this.consumers = []

		this.encoder = createEncoder(inputFormat, config.encoder, log)
		this.buffer = new (config.encoder.format === 'opus' ? OggBurstBuffer : BurstBuffer)(
			config.burstSize ?? (config.encoder.bitrate ?? 128) * 60 * 8,
			log
		)

		this.encoder.on('restart', () => {
			this.buffer.clear()
		})

		this.encoder.on('data', chunk => {
			this.buffer.write(chunk)
			this.emit('data', chunk)
		})
	}

	public get burstBuffer(): Buffer {
		return this.buffer.burstBuffer
	}

	public get isActive(): boolean {
		return this.encoder.isRunning
	}

	public start() {
		this.encoder.start()
	}

	public stop() {
		this.buffer.clear()
		this.emit('end')
		this.encoder.stop()
	}
}

export default StreamMount
