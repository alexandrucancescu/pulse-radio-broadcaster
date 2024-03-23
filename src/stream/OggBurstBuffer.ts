import { Logger } from 'pino'
import BurstBuffer from './BurstBuffer.js'

export default class OggBurstBuffer extends BurstBuffer {
	private codecHeader?: Buffer

	constructor(byteSize: number, log: Logger) {
		super(byteSize, log)
	}

	public clear() {
		super.clear()
		this.codecHeader = undefined
	}

	public get isReady() {
		return this.codecHeader !== undefined
	}

	write(chunk: Buffer): void {
		if (!this.codecHeader) {
			this.codecHeader = chunk
			this.log.warn(chunk.toString())

			return
		}

		super.write(chunk)
	}

	public get burstBuffer(): Buffer {
		return this.codecHeader
			? Buffer.concat([this.codecHeader, this.buffer])
			: this.buffer
	}
}
