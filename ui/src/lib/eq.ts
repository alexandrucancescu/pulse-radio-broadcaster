// Graphic-EQ model + biquad magnitude response, client side.
//
// The backend stores EQ as a free-form `bands: EqBand[]` array (see
// src/dsp/settings.ts). A "graphic EQ" is just a specific reading of that
// array: peaking filters at ten fixed octave frequencies with a fixed Q.
// The response curve is computed here with the SAME Audio-EQ-Cookbook
// formulas the audio path uses (src/dsp/Biquad.ts), so what you see is
// what you hear.

import type { EqBand, EqParams } from '../hooks/useDsp'

// Ten octave-spaced ISO-ish centers — the car-stereo / Winamp / iTunes grid.
export const GRAPHIC_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const GRAPHIC_LABELS = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

// Octave-wide peaking filters: Q ≈ 1.41 makes adjacent bands overlap into a
// smooth curve instead of ten separate bumps.
export const GRAPHIC_Q = 1.41

// The bands array is capped at 16 by the schema (both route and config
// store). Ten graphic slots leave six for Advanced bands.
export const MAX_BANDS = 16

// Sample rate only affects the drawn curve, and only imperceptibly for these
// frequencies — 44.1k is fine whether the stream is 44.1 or 48.
const DISPLAY_SAMPLE_RATE = 44100

export const GRAPHIC_GAIN_RANGE = 12

type Preset = {
	name: string
	blurb: string
	preampDb: number
	// One gain (dB) per GRAPHIC_FREQS entry.
	gains: number[]
}

// Designed around standard mix targets: 80–160Hz warmth, 200–400Hz "mud",
// 2–5kHz vocal presence/intelligibility, 10–16kHz "air". Boost-heavy presets
// carry a preamp cut for headroom (the limiter is still stubbed). Preamps
// were nudged +1 across the board per the operator's taste, bass boost +2.
export const EQ_PRESETS: Preset[] = [
	{ name: 'Flat', blurb: 'No coloring', preampDb: 1, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
	{
		name: 'Warm',
		blurb: 'Fuller lows, softer top',
		preampDb: 0,
		gains: [2, 2.5, 1.5, 0.5, 0, 0, -0.5, -1, -1.5, -1],
	},
	{
		name: 'Bright',
		blurb: 'Lifted highs and air',
		preampDb: -1,
		gains: [0, 0, 0, 0, 0, 0.5, 1.5, 2.5, 3, 3],
	},
	{
		name: 'Voice clarity',
		blurb: 'Speech presence, less mud',
		preampDb: 0,
		gains: [-2, -1, -0.5, -1.5, 0, 1, 2.5, 2, 1, 0],
	},
	{
		name: 'Bass boost',
		blurb: 'Deep low-end weight',
		preampDb: -1,
		gains: [4, 4.5, 3, 1, 0, 0, 0, 0, 0.5, 1],
	},
	{
		name: 'FM broadcast',
		blurb: 'Loud, scooped, present',
		preampDb: -2,
		gains: [2.5, 3, 1, -1, -1.5, -1, 0.5, 2, 3, 2.5],
	},
	{
		name: 'Smile',
		blurb: 'Boosted lows and highs',
		preampDb: -1,
		gains: [3, 2.5, 1, 0, -1.5, -2, -1, 1, 2.5, 3],
	},
]

const isGraphicBand = (b: EqBand): boolean =>
	b.type === 'peaking' && (GRAPHIC_FREQS as readonly number[]).includes(b.frequency)

/** Gain of each graphic slider, read out of the current bands (0 if absent). */
export function readGraphicGains(bands: EqBand[]): number[] {
	return GRAPHIC_FREQS.map(freq => {
		const band = bands.find(b => isGraphicBand(b) && b.frequency === freq)
		return band ? band.gainDb : 0
	})
}

/** Bands that aren't part of the graphic grid — edited under "Advanced". */
export function advancedBands(bands: EqBand[]): EqBand[] {
	return bands.filter(b => !isGraphicBand(b))
}

/** The graphic-grid bands (peaking filters sitting on a slider frequency). */
export function graphicBands(bands: EqBand[]): EqBand[] {
	return bands.filter(isGraphicBand)
}

/**
 * Set one graphic slider. A gain of 0 removes the band entirely (a flat
 * slider costs no biquad) — this keeps the array minimal and CPU low.
 * Advanced bands are preserved untouched.
 */
export function setGraphicGain(bands: EqBand[], index: number, gainDb: number): EqBand[] {
	const grid: EqBand[] = []

	GRAPHIC_FREQS.forEach((f, i) => {
		const gain = i === index ? gainDb : (bands.find(b => isGraphicBand(b) && b.frequency === f)?.gainDb ?? 0)
		if (gain !== 0) grid.push({ type: 'peaking', frequency: f, gainDb: gain, q: GRAPHIC_Q })
	})

	return [...grid, ...advancedBands(bands)]
}

/** Turn a preset into a full EqParams value (replaces the whole curve). */
export function presetToEq(preset: Preset, enabled: boolean): EqParams {
	const bands: EqBand[] = []
	preset.gains.forEach((gain, i) => {
		if (gain !== 0) bands.push({ type: 'peaking', frequency: GRAPHIC_FREQS[i], gainDb: gain, q: GRAPHIC_Q })
	})
	return { enabled, preampDb: preset.preampDb, bands }
}

/** True when the live curve equals this preset (to highlight the active one). */
export function matchesPreset(eq: EqParams, preset: Preset): boolean {
	if (eq.preampDb !== preset.preampDb) return false
	if (advancedBands(eq.bands).length > 0) return false
	const gains = readGraphicGains(eq.bands)
	return gains.every((g, i) => g === preset.gains[i])
}

// ── Biquad magnitude response (Audio EQ Cookbook, mirrors src/dsp/Biquad.ts) ──

type Coeffs = { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number }

function bandCoeffs(band: EqBand, fs: number): Coeffs {
	const A = Math.pow(10, band.gainDb / 40)
	const w0 = (2 * Math.PI * band.frequency) / fs
	const cosW0 = Math.cos(w0)
	const alpha = Math.sin(w0) / (2 * band.q)

	if (band.type === 'peaking') {
		return {
			b0: 1 + alpha * A,
			b1: -2 * cosW0,
			b2: 1 - alpha * A,
			a0: 1 + alpha / A,
			a1: -2 * cosW0,
			a2: 1 - alpha / A,
		}
	}

	const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
	if (band.type === 'lowshelf') {
		return {
			b0: A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha),
			b1: 2 * A * (A - 1 - (A + 1) * cosW0),
			b2: A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha),
			a0: A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha,
			a1: -2 * (A - 1 + (A + 1) * cosW0),
			a2: A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha,
		}
	}
	// highshelf
	return {
		b0: A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha),
		b1: -2 * A * (A - 1 + (A + 1) * cosW0),
		b2: A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha),
		a0: A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha,
		a1: 2 * (A - 1 - (A + 1) * cosW0),
		a2: A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha,
	}
}

function bandGainDbAt(c: Coeffs, freq: number, fs: number): number {
	const w = (2 * Math.PI * freq) / fs
	const cosW = Math.cos(w)
	const cos2W = Math.cos(2 * w)
	const sinW = Math.sin(w)
	const sin2W = Math.sin(2 * w)

	const numRe = c.b0 + c.b1 * cosW + c.b2 * cos2W
	const numIm = -(c.b1 * sinW + c.b2 * sin2W)
	const denRe = c.a0 + c.a1 * cosW + c.a2 * cos2W
	const denIm = -(c.a1 * sinW + c.a2 * sin2W)

	const mag = Math.sqrt((numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm))
	return 20 * Math.log10(mag)
}

/**
 * Total EQ response (dB) at each frequency: preamp + the sum of all band
 * responses. Series biquads multiply in magnitude, i.e. add in dB.
 */
export function computeResponse(eq: EqParams, freqs: number[]): number[] {
	const coeffs = eq.bands.map(b => bandCoeffs(b, DISPLAY_SAMPLE_RATE))
	return freqs.map(freq => {
		let db = eq.preampDb
		for (const c of coeffs) db += bandGainDbAt(c, freq, DISPLAY_SAMPLE_RATE)
		return db
	})
}

/** Log-spaced frequency points across the audible range, for drawing. */
export function logFreqPoints(count: number, min = 20, max = 20000): number[] {
	const logMin = Math.log10(min)
	const logMax = Math.log10(max)
	return Array.from({ length: count }, (_, i) =>
		Math.pow(10, logMin + ((logMax - logMin) * i) / (count - 1)),
	)
}
