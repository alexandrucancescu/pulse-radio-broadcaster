import { EqBand } from './settings.js'

/**
 * One second-order IIR filter ("biquad") with per-channel state.
 *
 * Coefficients come from the Audio EQ Cookbook by Robert
 * Bristow-Johnson (https://www.w3.org/TR/audio-eq-cookbook/) — the
 * same formulas ffmpeg's equalizer/bass/treble filters and the Web
 * Audio API's BiquadFilterNode are built on.
 *
 * The filter runs in Direct Form II transposed: two state variables
 * per channel, updated once per sample:
 *
 *   y  = b0*x + s1
 *   s1 = b1*x - a1*y + s2
 *   s2 = b2*x - a2*y
 */
export default class Biquad {
	private readonly b0: number
	private readonly b1: number
	private readonly b2: number
	private readonly a1: number
	private readonly a2: number

	// Two state variables per channel (index = channel)
	private readonly s1: Float64Array
	private readonly s2: Float64Array

	private constructor(
		channels: number,
		b0: number,
		b1: number,
		b2: number,
		a0: number,
		a1: number,
		a2: number
	) {
		// Normalize so a0 = 1
		this.b0 = b0 / a0
		this.b1 = b1 / a0
		this.b2 = b2 / a0
		this.a1 = a1 / a0
		this.a2 = a2 / a0

		this.s1 = new Float64Array(channels)
		this.s2 = new Float64Array(channels)
	}

	/** Process one sample (float, nominal range -1..1) for one channel */
	public process(x: number, channel: number): number {
		const y = this.b0 * x + this.s1[channel]
		this.s1[channel] = this.b1 * x - this.a1 * y + this.s2[channel]
		this.s2[channel] = this.b2 * x - this.a2 * y
		return y
	}

	public static fromBand(band: EqBand, sampleRate: number, channels: number): Biquad {
		switch (band.type) {
			case 'peaking':
				return Biquad.peaking(sampleRate, channels, band.frequency, band.gainDb, band.q)
			case 'lowshelf':
				return Biquad.lowShelf(sampleRate, channels, band.frequency, band.gainDb, band.q)
			case 'highshelf':
				return Biquad.highShelf(sampleRate, channels, band.frequency, band.gainDb, band.q)
		}
	}

	/** Boost/cut around a center frequency; q controls the width */
	public static peaking(
		sampleRate: number,
		channels: number,
		frequency: number,
		gainDb: number,
		q: number
	): Biquad {
		const A = Math.pow(10, gainDb / 40)
		const w0 = (2 * Math.PI * frequency) / sampleRate
		const cosW0 = Math.cos(w0)
		const alpha = Math.sin(w0) / (2 * q)

		return new Biquad(
			channels,
			1 + alpha * A,
			-2 * cosW0,
			1 - alpha * A,
			1 + alpha / A,
			-2 * cosW0,
			1 - alpha / A
		)
	}

	/** Boost/cut everything below the corner frequency */
	public static lowShelf(
		sampleRate: number,
		channels: number,
		frequency: number,
		gainDb: number,
		q: number
	): Biquad {
		const A = Math.pow(10, gainDb / 40)
		const w0 = (2 * Math.PI * frequency) / sampleRate
		const cosW0 = Math.cos(w0)
		const alpha = Math.sin(w0) / (2 * q)
		const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha

		return new Biquad(
			channels,
			A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha),
			2 * A * (A - 1 - (A + 1) * cosW0),
			A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha),
			A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha,
			-2 * (A - 1 + (A + 1) * cosW0),
			A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha
		)
	}

	/** Boost/cut everything above the corner frequency */
	public static highShelf(
		sampleRate: number,
		channels: number,
		frequency: number,
		gainDb: number,
		q: number
	): Biquad {
		const A = Math.pow(10, gainDb / 40)
		const w0 = (2 * Math.PI * frequency) / sampleRate
		const cosW0 = Math.cos(w0)
		const alpha = Math.sin(w0) / (2 * q)
		const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha

		return new Biquad(
			channels,
			A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha),
			-2 * A * (A - 1 + (A + 1) * cosW0),
			A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha),
			A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha,
			2 * (A - 1 - (A + 1) * cosW0),
			A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha
		)
	}
}
