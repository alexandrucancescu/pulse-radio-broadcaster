import { FastifyInstance } from 'fastify'
import type ListenerStats from '../stats/ListenerStats.js'
import type SourceManager from '../sources/SourceManager.js'
import { requireAuth } from '../plugins/auth.js'
import type StreamConnections from '../outputs/StreamConnections.js'
import { config } from '../config/ConfigStore.js'

type Options = {
	listenerStats: ListenerStats
	sourceManager: SourceManager
	connections: StreamConnections
}

export default async function (app: FastifyInstance, { listenerStats, sourceManager, connections }: Options) {
	app.get('/api/stats', { onRequest: requireAuth() }, async () => {
		const [listeners, listenerCount, uniqueIpCount, listenersByReferer, listenersByCountry, workerMemory] = await Promise.all([
			listenerStats.getAllListeners(),
			listenerStats.getListenerCount(),
			listenerStats.getUniqueIpCount(),
			listenerStats.getListenersByReferer(),
			listenerStats.getListenersByCountry(),
			listenerStats.getMemoryUsage(),
		])

		const m = process.memoryUsage()
		const budgetBytes = config().server.streamTotalBufferMb * 1024 * 1024
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
			listeners: config().server.statsDebug
				? listeners.map(l => ({ ...l, bufferedBytes: connections.bufferedFor(l.id) }))
				: listeners,
			uptime: sourceManager.getUptime(),
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
}
