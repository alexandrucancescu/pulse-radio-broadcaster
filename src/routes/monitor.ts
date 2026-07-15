import { FastifyInstance } from 'fastify'
import BasicAuth from '@fastify/basic-auth'
import type MonitorMount from '../stream/MonitorMount.js'
import { statsAuthConfigured, validateStatsAuth } from '../util/auth.js'
import { Logger } from 'pino'

type Options = {
	monitorMount: MonitorMount
	log: Logger
}

export default async function (app: FastifyInstance, { monitorMount, log }: Options) {
	if (!statsAuthConfigured()) {
		log.warn('Not initializing /monitor.wav as STATS_USERNAME / STATS_PASSWORD are not set')
		return
	}

	app.register(BasicAuth, {
		validate: validateStatsAuth,
		authenticate: true,
	}).after(() => {
		app.get('/monitor.wav', { onRequest: app.basicAuth }, (_, reply) => {
			reply.hijack()

			reply.raw.writeHead(200, {
				'Content-Type': 'audio/wav',
				'Cache-Control': 'no-store, no-cache',
				'Access-Control-Allow-Origin': '*',
			})

			monitorMount.addClient(reply.raw)
		})
	})
}
