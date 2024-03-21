import { FastifyInstance } from 'fastify'
import type ListenerStats from '../stats/ListenerStats.js'

type Options = {
	listenerStats: ListenerStats
}

export default async function (app: FastifyInstance, { listenerStats }: Options) {
	app.get('/stats', async () => {
		const listeners = await listenerStats.getAllListeners()

		return {
			listenerCount: listeners.length,
			listeners,
		}
	})
}
