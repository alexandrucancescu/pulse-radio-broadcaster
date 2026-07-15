import Biquad from './Biquad.js'
import { EqParams } from './settings.js'

/**
 * In-process equalizer: preamp gain + a chain of biquad bands.
 *
 * Operates directly on the s16be interleaved PCM buffers flowing
 * through the pipeline. Parameter changes take effect on the next
 * processed buffer — no process restarts, no gaps.
 *
 * Samples are converted to Float64 for filtering and clamped back to
 * int16 on the way out (a boosted band can exceed the int16 range;
 * without clamping it would wrap around into loud garbage).
 */
export default class NodeEq {
	private readonly sampleRate: number
	private readonly channels: number
	private readonly bytesPerFrame: number

	private enabled = false
	private preampLinear = 1
	private filters: Biquad[] = []

	// Bytes carried over when a chunk doesn't end on a frame boundary
	private remainder: Buffer = Buffer.alloc(0)

	constructor(sampleRate: number, channels: number) {
		this.sampleRate = sampleRate
		this.channels = channels
		this.bytesPerFrame = 2 * channels
	}

	public setParams(params: EqParams) {
		this.enabled = params.enabled
		this.preampLinear = Math.pow(10, params.preampDb / 20)

		// Fresh filters start with zero state: at worst a tiny click
		// right when settings change, never ongoing artifacts
		this.filters = params.bands.map(band =>
			Biquad.fromBand(band, this.sampleRate, this.channels)
		)
	}

	/**
	 * Process one PCM chunk (s16be interleaved). Returns the processed
	 * chunk; when disabled the input buffer is returned untouched.
	 */
	public process(chunk: Buffer): Buffer {
		if (!this.enabled) return chunk

		let input = chunk
		if (this.remainder.length > 0) {
			input = Buffer.concat([this.remainder, chunk])
			this.remainder = Buffer.alloc(0)
		}

		const usableBytes = input.length - (input.length % this.bytesPerFrame)
		if (usableBytes < input.length) {
			this.remainder = input.subarray(usableBytes)
		}

		const output = Buffer.allocUnsafe(usableBytes)
		const sampleCount = usableBytes / 2

		for (let i = 0; i < sampleCount; i++) {
			const channel = i % this.channels
			const offset = i * 2

			// int16 → float (-1..1)
			let sample = (input.readInt16BE(offset) / 32768) * this.preampLinear

			for (const filter of this.filters) {
				sample = filter.process(sample, channel)
			}

			// float → int16, clamped
			const scaled = Math.round(sample * 32768)
			output.writeInt16BE(Math.max(-32768, Math.min(32767, scaled)), offset)
		}

		return output
	}
}
