import { FastifyInstance } from 'fastify'
import type MonitorMount from '../stream/MonitorMount.js'
import { statsAuthConfigured, validateStatsAuth, monitorToken } from '../util/auth.js'
import { Logger } from 'pino'
import { timingSafeEqual } from 'node:crypto'

type Options = {
	monitorMount: MonitorMount
	log: Logger
}

function isValidToken(candidate: string): boolean {
	const expected = monitorToken()
	if (candidate.length !== expected.length) return false
	return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
}

export default async function (app: FastifyInstance, { monitorMount, log }: Options) {
	if (!statsAuthConfigured()) {
		log.warn('Not initializing /monitor.wav as STATS_USERNAME / STATS_PASSWORD are not set')
		return
	}

	app.get('/monitor.wav', async (request, reply) => {
		const token = (request.query as Record<string, string>).token

		if (token) {
			if (!isValidToken(token)) {
				return reply.code(401).send({ error: 'Invalid token' })
			}
		} else {
			const auth = request.headers.authorization
			if (!auth?.startsWith('Basic ')) {
				reply.header('WWW-Authenticate', 'Basic realm="monitor"')
				return reply.code(401).send({ error: 'Unauthorized' })
			}
			const decoded = Buffer.from(auth.slice(6), 'base64').toString()
			const colon = decoded.indexOf(':')
			const user = decoded.slice(0, colon)
			const pass = decoded.slice(colon + 1)
			try {
				await validateStatsAuth(user, pass)
			} catch {
				reply.header('WWW-Authenticate', 'Basic realm="monitor"')
				return reply.code(401).send({ error: 'Unauthorized' })
			}
		}

		reply.hijack()

		reply.raw.writeHead(200, {
			'Content-Type': 'audio/wav',
			'Cache-Control': 'no-store, no-cache',
			'Access-Control-Allow-Origin': '*',
		})

		monitorMount.addClient(reply.raw)
	})
}
