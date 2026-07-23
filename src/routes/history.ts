import { FastifyInstance } from 'fastify'
import type ListenerStats from '../stats/ListenerStats.js'
import { requireAuth } from '../plugins/auth.js'

type Options = {
	listenerStats: ListenerStats
}

const RANGES = ['24h', '7d', '30d'] as const
type Range = (typeof RANGES)[number]

function parseRange(query: Record<string, string>): Range {
	const r = query.range
	return RANGES.includes(r as Range) ? (r as Range) : '7d'
}

export default async function (app: FastifyInstance, { listenerStats }: Options) {
	app.get('/api/history', { onRequest: requireAuth() }, async req => {
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
}
