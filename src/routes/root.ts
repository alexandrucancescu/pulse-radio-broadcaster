import { FastifyInstance } from 'fastify'
import type ListenerStats from '../stats/ListenerStats.js'
import BasicAuth from '@fastify/basic-auth'
import env from '../env.js'
import { Logger } from 'pino'

type Options = {
	listenerStats: ListenerStats
	log: Logger
}

export default async function (app: FastifyInstance, { listenerStats, log }: Options) {
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
			const listeners = await listenerStats.getAllListeners()

			return {
				listenerCount: listeners.length,
				listeners,
			}
		})
	})
}
