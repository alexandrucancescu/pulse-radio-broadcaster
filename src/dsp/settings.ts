import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import log from '../util/log.js'

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

// Settings live in ./data so a Docker volume can be mounted at /app/data
const SETTINGS_DIR = resolve(process.cwd(), 'data')
const SETTINGS_FILE = join(SETTINGS_DIR, 'dsp.json')

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

export function loadSettings(): DspSettings {
	if (!existsSync(SETTINGS_FILE)) {
		return structuredClone(DEFAULT_SETTINGS)
	}

	try {
		const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'))

		// Merge section-wise so settings files written by older versions
		// pick up defaults for fields they don't have yet
		return {
			eq: { ...DEFAULT_SETTINGS.eq, ...parsed.eq },
			dynamics: { ...DEFAULT_SETTINGS.dynamics, ...parsed.dynamics },
		}
	} catch (error) {
		log.error(error, `Failed to read ${SETTINGS_FILE}, using default DSP settings`)
		return structuredClone(DEFAULT_SETTINGS)
	}
}

export function saveSettings(settings: DspSettings) {
	mkdirSync(SETTINGS_DIR, { recursive: true })
	writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, '\t'))
}
