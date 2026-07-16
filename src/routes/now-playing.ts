import { FastifyInstance } from 'fastify'
import env from '../env.js'
import type NowPlaying from '../nowPlaying.js'
import { Logger } from 'pino'

type Options = {
	nowPlaying: NowPlaying
	log: Logger
}

export default async function (app: FastifyInstance, { nowPlaying, log }: Options) {
	if (!env.METADATA_TOKEN) {
		log.warn('METADATA_TOKEN not set — now-playing endpoint disabled')
		return
	}

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

	app.get('/api/now-playing', async () => {
		return {
			current: nowPlaying.getCurrent(),
			history: nowPlaying.getHistory(),
		}
	})
}
