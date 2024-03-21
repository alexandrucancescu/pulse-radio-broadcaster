import { Logger } from 'pino'

export default class BurstBuffer {
	private readonly byteSize: number
	private readonly log: Logger
	private readonly chunks: Buffer[]
	private buffer: Buffer

	constructor(byteSize: number, log: Logger) {
		this.byteSize = byteSize
		this.buffer = Buffer.alloc(0)
		this.chunks = []
		this.log = log
	}

	public clear() {
		this.buffer = Buffer.alloc(0)
	}

	public get isReady() {
		return this.buffer.byteLength === this.byteSize
	}

	write(chunk: Buffer): void {
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
		return this.buffer
	}
}
