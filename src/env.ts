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
})

export type StreamConfig = z.infer<typeof streamSchema>

const commaSeparated = z
	.string()
	.transform(s => s.split(',').map(v => v.trim()).filter(Boolean))

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
		RTP_ALLOWED_IPS: commaSeparated,
		RTP_NO_DATA_DISCONNECT_DELAY: z.coerce.number().int().positive().default(60),

		STREAMS: z
			.string()
			.transform(s => JSON.parse(s) as unknown)
			.pipe(z.array(streamSchema).min(1)),

		STATION_NAME: z.string().default('Radio Station'),
		STATION_DESCRIPTION: z.string().default('N/A'),
		STATION_GENRE: z.string().default('N/A'),
		STATION_PUBLIC: z
			.enum(['true', 'false'])
			.transform(v => v === 'true')
			.default('true'),

		GLOBAL_HEADERS: z
			.string()
			.transform(s => JSON.parse(s) as unknown)
			.pipe(z.record(z.string()))
			.default('{"Access-Control-Allow-Origin":"*","Cache-Control":"no-store, no-cache, must-revalidate"}'),

		LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

		STATS_USERNAME: z.string().optional(),
		STATS_PASSWORD: z.string().min(8).optional(),
	},
})

export default env
