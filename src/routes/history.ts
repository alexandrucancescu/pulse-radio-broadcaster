import { FastifyInstance } from 'fastify'
import BasicAuth from '@fastify/basic-auth'
import type ListenerStats from '../stats/ListenerStats.js'
import { statsAuthConfigured, validateStatsAuth } from '../util/auth.js'
import { Logger } from 'pino'

type Options = {
	listenerStats: ListenerStats
	log: Logger
}

const RANGES = ['24h', '7d', '30d'] as const
type Range = (typeof RANGES)[number]

function parseRange(query: Record<string, string>): Range {
	const r = query.range
	return RANGES.includes(r as Range) ? (r as Range) : '7d'
}

export default async function (app: FastifyInstance, { listenerStats, log }: Options) {
	if (!statsAuthConfigured()) {
		log.warn('Not initializing /api/history as STATS_USERNAME / STATS_PASSWORD are not set')
		return
	}

	app.register(BasicAuth, {
		validate: validateStatsAuth,
		authenticate: true,
	}).after(() => {
		app.get('/api/history', { onRequest: app.basicAuth }, async (req) => {
			const range = parseRange(req.query as Record<string, string>)

			const [
				listenersOverTime,
				listenersByHour,
				topCountries,
				topReferers,
				topIps,
				summary,
				peakConcurrent,
			] = await Promise.all([
				listenerStats.getListenersOverTime(range),
				listenerStats.getListenersByHour(),
				listenerStats.getTopCountries(range),
				listenerStats.getTopReferers(range),
				listenerStats.getTopIps(range),
				listenerStats.getSessionSummary(),
				listenerStats.getPeakConcurrent(),
			])

			return {
				range,
				listenersOverTime,
				listenersByHour,
				topCountries,
				topReferers,
				topIps,
				summary,
				peakConcurrent,
			}
		})
	})
}
