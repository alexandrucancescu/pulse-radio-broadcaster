
import type AudioOutput from './AudioOutput.js'
import type { OutputRouteDeps, OutputTap, AnyFastifyInstance } from './AudioOutput.js'
import IcecastOutput from './icecast/IcecastOutput.js'
import log from '../util/log.js'

// Anything that emits bus PCM chunks (a DspChain tap)
export type AudioBus = {
	on(event: 'data', handler: (chunk: Buffer) => void): unknown
}

/**
 * Feeds each output from the DSP tap it declares and fans lifecycle,
 * source-state changes and route registration out to them. Deliberately
 * dumb: knows nothing about codecs, ICY, WAV or segments — those are
 * per-output internals.
 */
export default class OutputManager {
	private readonly taps: Record<OutputTap, AudioBus>
	private readonly outputs: AudioOutput[]

	constructor(taps: Record<OutputTap, AudioBus>, outputs: AudioOutput[]) {
		this.taps = taps
		this.outputs = outputs
	}

	public start() {
		this.outputs.forEach(output => output.start())

		for (const tap of ['live', 'preview'] as const) {
			const consumers = this.outputs.filter(output => output.tap === tap)
			if (consumers.length === 0) continue

			this.taps[tap].on('data', chunk => {
				consumers.forEach(output => output.write(chunk))
			})
		}
	}

	public setSourceActive(active: boolean) {
		log.info(`Source ${active ? 'active' : 'inactive'} — notifying outputs`)
		this.outputs.forEach(output => output.setSourceActive(active))
	}

	public registerRoutes(app: AnyFastifyInstance, deps: OutputRouteDeps) {
		this.outputs.forEach(output => output.registerRoutes(app, deps))
	}

	/** The icecast-family mounts (stream directory, playlists, robots.txt) */
	public icecast(): IcecastOutput[] {
		return this.outputs.filter(
			(output): output is IcecastOutput => output instanceof IcecastOutput
		)
	}
}
