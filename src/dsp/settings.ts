// DSP parameter types and defaults. Persistence lives in the config
// store (dsp section) — a legacy data/dsp.json is absorbed on first boot.

export type EqBandType = 'peaking' | 'lowshelf' | 'highshelf'

export type EqBand = {
	type: EqBandType
	// Center frequency (peaking) or corner frequency (shelves), Hz
	frequency: number
	// Boost/cut in dB
	gainDb: number
	// Bandwidth (peaking) or slope steepness (shelves). 1 = neutral
	q: number
}

export type EqParams = {
	enabled: boolean
	// Static gain applied before the bands, dB
	preampDb: number
	bands: EqBand[]
}

export type DynamicsPreset = 'clean' | 'warm' | 'punchy' | 'loud'

export type DynamicsParams = {
	enabled: boolean
	preset: DynamicsPreset
	// loudnorm integrated loudness target, LUFS
	targetLufs: number
	// Macro that scales the mcompand curves (0 = preset default)
	drive: number
	// alimiter ceiling, dB
	ceilingDb: number
}

export type DspSettings = {
	eq: EqParams
	dynamics: DynamicsParams
}

export const DEFAULT_SETTINGS: DspSettings = {
	eq: {
		enabled: false,
		// Set negative to compensate the boosts below if loud passages
		// clip (no limiter yet while dynamics is stubbed)
		preampDb: 0,
		bands: [
			// Warmth: gentle low-end foundation
			{ type: 'lowshelf', frequency: 90, gainDb: 2.5, q: 0.7 },
			// De-mud: the 200-400Hz region is where streams sound "boxy"
			{ type: 'peaking', frequency: 300, gainDb: -2, q: 1 },
			// Presence: vocal/speech intelligibility
			{ type: 'peaking', frequency: 3000, gainDb: 1.5, q: 1 },
			// Air: the sparkle FM processing is known for
			{ type: 'highshelf', frequency: 9000, gainDb: 2.5, q: 0.7 },
		],
	},
	dynamics: {
		enabled: false,
		preset: 'clean',
		targetLufs: -16,
		drive: 0,
		ceilingDb: -1.5,
	},
}

