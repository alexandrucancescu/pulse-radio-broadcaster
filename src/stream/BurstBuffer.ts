import { Logger } from 'pino'

export default class BurstBuffer {
	protected readonly byteSize: number
	protected readonly log: Logger
	protected readonly chunks: Buffer[]
	protected buffer: Buffer

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
		return this.buffer.byteLength >= this.byteSize
	}

	write(chunk: Buffer): void {
		this.chunks.push(chunk)

		this.recalculateBuffer()
	}

	protected recalculateBuffer(): void {
		let totalSize = this.chunks.reduce(
			(accumulator, chunk) => accumulator + chunk.byteLength,
			0
		)

		while (totalSize > this.byteSize && this.chunks.length > 0) {
			const removedChunk = this.chunks.shift()!
			totalSize -= removedChunk.byteLength
		}

		this.buffer = Buffer.concat(this.chunks)
	}

	public get burstBuffer(): Buffer {
		return this.buffer
	}
}
