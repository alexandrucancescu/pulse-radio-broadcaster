import { z } from 'zod'
import { DEFAULT_SETTINGS } from '../dsp/settings.js'

// ── Section schemas ──────────────────────────────────────────────────
// The UI-managed configuration. Env keeps only what the orchestrator
// must know (ports, bind addresses, secrets, data dir) — see env.ts.

export const streamSchema = z.object({
	format: z.string(),
	paths: z.array(z.string().min(2)).min(1),
	bitrate: z.number().int().positive().optional(),
	channels: z.number().int().positive().optional(),
	codec: z.string().optional(),
	sampleRate: z.number().int().positive().optional(),
	options: z.array(z.string()).optional(),
	contentType: z.string().optional(),
	burstSize: z.number().int().min(512).optional(),
	headers: z.record(z.string()).optional(),
	// Override ICY metadata support (default: on for all formats except opus)
	icyMetadata: z.boolean().optional(),
})

export const stationSchema = z.object({
	name: z.string().min(1).default('Radio Station'),
	description: z.string().default('N/A'),
	genre: z.string().default('N/A'),
	// Station homepage, sent as icy-url (shown as a link in players)
	url: z.string().url().optional(),
	public: z.boolean().default(true),
})

export const inputsSchema = z.object({
	// A recovered higher-priority source must stay stable this long
	// before the manager switches back to it (prevents flapping)
	switchBackDelaySec: z.number().int().min(0).default(15),
	rtp: z.object({
		sampleRate: z.number().int().positive().default(44100),
		format: z.string().default('s16be'),
		allowedIps: z.array(z.string()).default([]),
		// Source considered inactive after this many seconds without packets
		noDataDisconnectDelaySec: z.number().int().positive().default(60),
		// How many packets each packet waits in the reorder buffer
		reorderDepth: z.number().int().positive().default(40),
	}),
})

export const serverSchema = z.object({
	// A listener whose unsent buffer exceeds this many seconds of audio
	// is kicked as stalled (dead/paused client)
	streamMaxBufferSeconds: z.number().int().positive().default(300),
	// Global cap on unsent audio across ALL listeners; worst-buffered
	// listeners are kicked first when exceeded. 0 disables.
	streamTotalBufferMb: z.number().int().min(0).default(1500),
	// Hard cap on concurrent stream connections per IP (429 above). 0 disables.
	maxConnectionsPerIp: z.number().int().min(0).default(10),
	// Case-insensitive UA substrings rejected with 403
	blockedUserAgents: z.array(z.string()).default([]),
	// Audio bytes between ICY metadata blocks
	icyMetaint: z.number().int().positive().default(16000),
	// Per-listener unsent-buffer bytes exposed in /stats (debug)
	statsDebug: z.boolean().default(false),
	// Origins allowed to subscribe to the now-playing SSE feed cross-origin.
	// Exact match or '*'. Empty = same-origin / no-Origin clients only.
	nowPlayingSseOrigins: z.array(z.string()).default([]),
})

const eqBandSchema = z.object({
	type: z.enum(['peaking', 'lowshelf', 'highshelf']),
	frequency: z.number().min(20).max(20000),
	gainDb: z.number().min(-24).max(24),
	q: z.number().min(0.05).max(20),
})

export const dspSchema = z.object({
	eq: z
		.object({
			enabled: z.boolean(),
			preampDb: z.number().min(-24).max(24),
			bands: z.array(eqBandSchema).max(16),
		})
		.default(DEFAULT_SETTINGS.eq),
	dynamics: z
		.object({
			enabled: z.boolean(),
			preset: z.enum(['clean', 'warm', 'punchy', 'loud']),
			targetLufs: z.number().min(-36).max(-6),
			drive: z.number().min(-10).max(10),
			ceilingDb: z.number().min(-6).max(0),
		})
		.default(DEFAULT_SETTINGS.dynamics),
})

export const configSchema = z.object({
	station: stationSchema.default({}),
	inputs: inputsSchema.default({ rtp: {} }),
	streams: z.array(streamSchema).default([]),
	server: serverSchema.default({}),
	dsp: dspSchema.default({}),
})

export type AppConfig = z.infer<typeof configSchema>
export type ConfigSection = keyof AppConfig

export const sectionSchemas = {
	station: stationSchema,
	inputs: inputsSchema,
	streams: z.array(streamSchema),
	server: serverSchema,
	dsp: dspSchema,
} as const

/**
 * Which sections apply live vs. require a restart. Structural sections
 * (streams/inputs/station) are baked into encoders, mounts and
 * precompiled headers at boot; server + dsp are read at use-time.
 */
export const RESTART_SECTIONS: ConfigSection[] = ['station', 'inputs', 'streams']
