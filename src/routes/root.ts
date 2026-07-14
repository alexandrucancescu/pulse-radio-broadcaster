import { FastifyInstance } from 'fastify'
import type ListenerStats from '../stats/ListenerStats.js'
import type StreamManager from '../stream/StreamManager.js'
import BasicAuth from '@fastify/basic-auth'
import env from '../env.js'
import { Logger } from 'pino'

type Options = {
	listenerStats: ListenerStats
	streamManager: StreamManager
	log: Logger
}

export default async function (app: FastifyInstance, { listenerStats, streamManager, log }: Options) {
	if (!env.STATS_USERNAME || !env.STATS_PASSWORD) {
		log.warn(
			'Not initializing statistic paths as STATS_USERNAME / STATS_PASSWORD are not set'
		)
		return
	}

	app.register(BasicAuth, {
		validate: async (username, password) => {
			if (username === env.STATS_USERNAME && password === env.STATS_PASSWORD) {
				return
			}
			throw new Error('Unauthorized')
		},
		authenticate: true,
	}).after(() => {
		app.get('/stats', { onRequest: app.basicAuth }, async () => {
			const [listeners, listenerCount, uniqueIpCount, listenersByReferer, listenersByCountry] = await Promise.all([
				listenerStats.getAllListeners(),
				listenerStats.getListenerCount(),
				listenerStats.getUniqueIpCount(),
				listenerStats.getListenersByReferer(),
				listenerStats.getListenersByCountry(),
			])

			return {
				listenerCount,
				uniqueIpCount,
				listenersByReferer,
				listenersByCountry,
				listeners,
				uptime: streamManager.getUptime(),
			}
		})
	})
}
