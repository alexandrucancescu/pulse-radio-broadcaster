import { FastifyInstance } from 'fastify'
import type ListenerStats from '../stats/ListenerStats.js'
import BasicAuth from '@fastify/basic-auth'
import config from '../config.js'
import { Logger } from 'pino'

type Options = {
	listenerStats: ListenerStats
	log: Logger
}

export default async function (app: FastifyInstance, { listenerStats, log }: Options) {
	if (!config.statisticsCredentials?.username || !config.statisticsCredentials.password) {
		log.warn(
			'Not initializing statistic paths as no credentials were provided in config.statisticsCredentials'
		)
		return
	}

	app.register(BasicAuth, {
		validate: async (username, password) => {
			if (
				username === config.statisticsCredentials?.username &&
				password === config.statisticsCredentials?.password
			) {
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
