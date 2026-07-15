import EventEmitter from 'node:events'
import { DynamicsParams } from './settings.js'
import log from '../util/log.js'

declare interface DynamicsProcessor extends EventEmitter {
	on(event: 'data', handler: (chunk: Buffer) => void): this
}

/**
 * Dynamics stage of the DSP chain: loudnorm → mcompand → alimiter.
 *
 * STUB: currently forwards audio untouched regardless of params.
 *
 * The real implementation will spawn a PCM→PCM ffmpeg process with an
 * "-af" chain built from the preset + macros (see settings.ts), pipe
 * chunks through stdin/stdout, auto-restart it on crash (fail-open:
 * while the process is down, audio passes through unprocessed), and
 * restart it when setParams() changes the chain.
 */
class DynamicsProcessor extends EventEmitter {
	private params: DynamicsParams

	constructor(params: DynamicsParams) {
		super()
		this.params = params
	}

	public start() {
		if (this.params.enabled) {
			log.warn('DynamicsProcessor is a stub — audio passes through unprocessed')
		}
	}

	public stop() {}

	public setParams(params: DynamicsParams) {
		this.params = params
		// Real implementation: rebuild the -af chain and restart ffmpeg
	}

	public getParams(): DynamicsParams {
		return this.params
	}

	public write(chunk: Buffer) {
		// Real implementation: write to ffmpeg stdin when enabled and
		// running; emit stdout data. Stub: pass straight through.
		this.emit('data', chunk)
	}
}

export default DynamicsProcessor
