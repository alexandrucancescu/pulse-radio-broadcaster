import EventEmitter from 'node:events'
import NodeEq from './NodeEq.js'
import DynamicsProcessor from './DynamicsProcessor.js'
import {
	DspSettings,
	DynamicsParams,
	EqParams,
	loadSettings,
	saveSettings,
} from './settings.js'
import log from '../util/log.js'

declare interface DspChain extends EventEmitter {
	on(event: 'data', handler: (chunk: Buffer) => void): this
}

/**
 * The audio processing pipeline between the RTP receiver and the
 * stream encoders:
 *
 *   write(pcm) → NodeEq (live-tweakable) → DynamicsProcessor → 'data'
 *
 * Everything is s16be interleaved PCM in and out. This is the only
 * DSP class the rest of the app talks to.
 */
class DspChain extends EventEmitter {
	private readonly eq: NodeEq
	private readonly dynamics: DynamicsProcessor
	private settings: DspSettings

	constructor(inputFormat: { sampleRate: number; channels: number }) {
		super()

		this.settings = loadSettings()

		this.eq = new NodeEq(inputFormat.sampleRate, inputFormat.channels)
		this.eq.setParams(this.settings.eq)

		this.dynamics = new DynamicsProcessor(this.settings.dynamics)
		this.dynamics.on('data', chunk => this.emit('data', chunk))

		log.info(
			`DSP chain: eq ${this.settings.eq.enabled ? 'on' : 'off'} (${this.settings.eq.bands.length} bands)` +
				` | dynamics ${this.settings.dynamics.enabled ? 'on' : 'off'} (${this.settings.dynamics.preset})`
		)
	}

	public start() {
		this.dynamics.start()
	}

	public write(chunk: Buffer) {
		this.dynamics.write(this.eq.process(chunk))
	}

	public getSettings(): DspSettings {
		return this.settings
	}

	public updateEq(params: Partial<EqParams>): DspSettings {
		this.settings = {
			...this.settings,
			eq: { ...this.settings.eq, ...params },
		}

		this.eq.setParams(this.settings.eq)
		saveSettings(this.settings)

		return this.settings
	}

	public updateDynamics(params: Partial<DynamicsParams>): DspSettings {
		this.settings = {
			...this.settings,
			dynamics: { ...this.settings.dynamics, ...params },
		}

		this.dynamics.setParams(this.settings.dynamics)
		saveSettings(this.settings)

		return this.settings
	}
}

export default DspChain
