import { Logger } from 'pino'

export default class OggBurstBuffer {
	private readonly byteSize: number
	private readonly log: Logger
	private readonly chunks: Buffer[]
	private buffer: Buffer
	private codecHeader?: Buffer

	constructor(byteSize: number, log: Logger) {
		this.byteSize = byteSize
		this.buffer = Buffer.alloc(0)
		this.chunks = []
		this.log = log
	}

	public clear() {
		this.buffer = Buffer.alloc(0)
		this.codecHeader = undefined
		delete this.codecHeader
	}

	public get isReady() {
		return this.buffer.byteLength === this.byteSize
	}

	write(chunk: Buffer): void {
		//TODO Better header handling
		if (!this.codecHeader) {
			this.codecHeader = chunk
			this.log.warn(chunk.toString())

			return
		}

		this.chunks.push(chunk)

		let chunksByteLength = this.chunks.reduce(
			(accumulator, chunk) => accumulator + chunk.byteLength,
			0
		)

		while (chunksByteLength > this.byteSize && this.chunks.length > 0) {
			const removedChunk = this.chunks.shift()!
			chunksByteLength -= removedChunk.byteLength
		}

		// noinspection TypeScriptValidateJSTypes
		this.buffer = Buffer.concat(this.chunks)
	}

	public get burstBuffer(): Buffer {
		return this.codecHeader ? Buffer.concat([this.codecHeader, this.buffer]) : this.buffer
	}

	end(): void {
		throw new Error('Method not implemented.')
	}
}
