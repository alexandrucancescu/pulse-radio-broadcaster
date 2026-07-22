import { FastifyInstance } from 'fastify'
import { FastifySSEPlugin } from 'fastify-sse-v2'
import env from '../env.js'
import type NowPlaying from '../nowPlaying.js'
import type { NowPlayingEntry } from '../nowPlaying.js'
import configStore from '../config/ConfigStore.js'
import { Logger } from 'pino'

type Options = {
	nowPlaying: NowPlaying
	log: Logger
}

const SSE_HEARTBEAT_MS = 25_000

export default async function (app: FastifyInstance, { nowPlaying, log }: Options) {
	// Every SSE subscriber adds an 'update' listener
	nowPlaying.setMaxListeners(0)

	await app.register(FastifySSEPlugin)

	if (env.METADATA_TOKEN) {
		app.post<{ Body: { title: string } }>('/api/song-playing', async (req, reply) => {
			const token = req.headers.authorization?.split(' ')[1]

			if (!token || token !== env.METADATA_TOKEN) {
				return reply.status(401).send({ error: 'Unauthorized' })
			}

			const { title } = req.body as { title: string }

			if (!title || typeof title !== 'string' || title.length < 2) {
				return reply.status(400).send({ error: 'title is required (min 2 chars)' })
			}

			nowPlaying.handleUpdate(title)
			log.info({ title }, 'Now playing updated')

			return { success: true }
		})
	} else {
		log.warn('METADATA_TOKEN not set — song-playing update endpoint disabled')
	}

	app.get('/api/now-playing', async () => {
		return {
			current: nowPlaying.getCurrent(),
			history: nowPlaying.getHistory(),
		}
	})

	app.get('/api/now-playing/sse', (req, reply) => {
		const origin = req.headers.origin
		const allowedOrigins = configStore.get().server.nowPlayingSseOrigins

		if (origin && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) {
			return reply.status(403).send({ error: 'Origin not allowed' })
		}

		if (origin) {
			reply.header(
				'access-control-allow-origin',
				allowedOrigins.includes('*') ? '*' : origin
			)
			reply.header('vary', 'origin')
		}
		// Disable proxy response buffering (nginx and compatibles)
		reply.header('x-accel-buffering', 'no')
		// An explicit Content-Encoding makes proxy compress middlewares skip
		// this response — Traefik v3's br/zstd encoders buffer SSE forever
		reply.header('content-encoding', 'identity')

		const send = (entry: NowPlayingEntry | null) => {
			reply.sse({ event: 'now-playing', data: JSON.stringify(entry) })
		}

		send(nowPlaying.getCurrent())
		nowPlaying.on('update', send)

		// Periodic frames keep idle connections alive through proxies
		const heartbeat = setInterval(
			() => reply.sse({ event: 'ping', data: 'ping' }),
			SSE_HEARTBEAT_MS
		)

		req.raw.on('close', () => {
			clearInterval(heartbeat)
			nowPlaying.off('update', send)
			reply.sseContext.source.end()
		})
	})
}
