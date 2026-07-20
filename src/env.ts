import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const streamSchema = z.object({
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

export type StreamConfig = z.infer<typeof streamSchema>

const json = <T extends z.ZodType>(schema: T) =>
	z.preprocess((v) => (typeof v === 'string' ? JSON.parse(v) : v), schema)

const csv = z.preprocess(
	(v) => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : v),
	z.array(z.string()),
)

const boolStr = z.preprocess(
	(v) => (v === undefined || v === '' ? true : v === 'true'),
	z.boolean(),
)

const env = createEnv({
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	server: {
		HOST: z.string().default('0.0.0.0'),
		PORT: z.coerce.number().int().min(0).default(3000),

		RTP_HOST: z.string().default('0.0.0.0'),
		RTP_PORT: z.coerce.number().int().min(0).default(3100),
		RTP_SAMPLE_RATE: z.coerce.number().int().positive().default(44100),
		RTP_FORMAT: z.string().default('s16be'),
		RTP_ALLOWED_IPS: csv,
		RTP_NO_DATA_DISCONNECT_DELAY: z.coerce.number().int().positive().default(60),
		// A listener whose unsent audio buffer exceeds this many seconds is
		// kicked as stalled (dead/paused client), bounding the slow-client
		// memory leak. Generous enough to ride out mobile network blips.
		STREAM_MAX_BUFFER_SECONDS: z.coerce.number().int().positive().default(5 * 60),
		// How many packets each packet waits in the reorder buffer
		// (~320ms at ~126 packets/sec for 44.1kHz stereo 16-bit PCM)
		RTP_REORDER_DEPTH: z.coerce.number().int().positive().default(40),

		STREAMS: json(z.array(streamSchema).min(1)),

		// Hard cap on concurrent stream connections per IP, rejected with 429
		// before they become listeners. Generous enough for NAT/CGNAT groups
		// and multi-connection clients (iOS opens 2). 0 disables.
		MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(0).default(10),
		// Case-insensitive UA substrings rejected with 403. Ships empty —
		// add entries when abuse shows up in the dashboard.
		BLOCKED_USER_AGENTS: csv.optional(),

		STATION_NAME: z.string().default('Radio Station'),
		STATION_DESCRIPTION: z.string().default('N/A'),
		STATION_GENRE: z.string().default('N/A'),
		STATION_PUBLIC: boolStr,
		// Station homepage, sent as icy-url (shown as a link in players)
		STATION_URL: z.string().url().optional(),

		GLOBAL_HEADERS: json(z.record(z.string())).default(
			'{"Access-Control-Allow-Origin":"*","Cache-Control":"no-store, no-cache, must-revalidate"}',
		),

		LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

		STATS_USERNAME: z.string().optional(),
		STATS_PASSWORD: z.string().min(8).optional(),
		// Debug instrumentation: per-listener unsent-buffer bytes in /stats
		// (distinguishes stalled clients from draining ones). Off by default.
		STATS_DEBUG: z.preprocess(v => v === 'true' || v === '1', z.boolean()),

		METADATA_TOKEN: z.string().min(8).optional(),
		// Audio bytes between ICY metadata blocks (Icecast default)
		ICY_METAINT: z.coerce.number().int().positive().default(16000),
	},
})

export default env
