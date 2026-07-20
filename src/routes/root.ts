import { FastifyInstance } from 'fastify'
import type ListenerStats from '../stats/ListenerStats.js'
import type StreamManager from '../stream/StreamManager.js'
import BasicAuth from '@fastify/basic-auth'
import { statsAuthConfigured, validateStatsAuth } from '../util/auth.js'
import type StreamConnections from '../stream/StreamConnections.js'
import env from '../env.js'
import { Logger } from 'pino'

type Options = {
	listenerStats: ListenerStats
	streamManager: StreamManager
	connections: StreamConnections
	log: Logger
}

export default async function (app: FastifyInstance, { listenerStats, streamManager, connections, log }: Options) {
	if (!statsAuthConfigured()) {
		log.warn(
			'Not initializing statistic paths as STATS_USERNAME / STATS_PASSWORD are not set'
		)
		return
	}

	app.register(BasicAuth, {
		validate: validateStatsAuth,
		authenticate: true,
	}).after(() => {
		app.get('/stats', { onRequest: app.basicAuth }, async () => {
			const [listeners, listenerCount, uniqueIpCount, listenersByReferer, listenersByCountry, workerMemory] = await Promise.all([
				listenerStats.getAllListeners(),
				listenerStats.getListenerCount(),
				listenerStats.getUniqueIpCount(),
				listenerStats.getListenersByReferer(),
				listenerStats.getListenersByCountry(),
				listenerStats.getMemoryUsage(),
			])

			const m = process.memoryUsage()
			const budgetBytes = env.STREAM_TOTAL_BUFFER_MB * 1024 * 1024
			const totalBufferedBytes = connections.totalBuffered()

			return {
				streamBuffers: {
					totalBytes: totalBufferedBytes,
					budgetBytes,
					percentOfBudget:
						budgetBytes > 0
							? Math.round((totalBufferedBytes / budgetBytes) * 100)
							: null,
				},
				listenerCount,
				uniqueIpCount,
				listenersByReferer,
				listenersByCountry,
				listeners: env.STATS_DEBUG
					? listeners.map(l => ({ ...l, bufferedBytes: connections.bufferedFor(l.id) }))
					: listeners,
				uptime: streamManager.getUptime(),
				memory: {
					main: {
						rss: m.rss,
						heapUsed: m.heapUsed,
						heapTotal: m.heapTotal,
						external: m.external,
						arrayBuffers: m.arrayBuffers,
					},
					worker: workerMemory,
				},
			}
		})
	})
}
