import { FastifyInstance } from 'fastify'
import BasicAuth from '@fastify/basic-auth'
import { ZodError } from 'zod'
import { statsAuthConfigured, validateStatsAuth } from '../util/auth.js'
import configStore from '../config/ConfigStore.js'
import { ConfigSection, RESTART_SECTIONS, sectionSchemas } from '../config/schema.js'
import { Logger } from 'pino'

type Options = {
	log: Logger
}

function isConfigSection(value: string): value is ConfigSection {
	return value in sectionSchemas
}

export default async function (app: FastifyInstance, { log }: Options) {
	if (!statsAuthConfigured()) {
		log.warn('Not initializing /api/config as STATS_USERNAME / STATS_PASSWORD are not set')
		return
	}

	app.register(BasicAuth, {
		validate: validateStatsAuth,
		authenticate: true,
	}).after(() => {
		app.get('/api/config', { onRequest: app.basicAuth }, async () => {
			return {
				config: configStore.get(),
				restartSections: RESTART_SECTIONS,
			}
		})

		app.put<{ Params: { section: string } }>(
			'/api/config/:section',
			{ onRequest: app.basicAuth },
			async (req, reply) => {
				const { section } = req.params

				if (!isConfigSection(section)) {
					reply.status(404)
					return { error: `Unknown config section '${section}'` }
				}

				try {
					const result = configStore.update(section, req.body)
					log.info(`Config section '${section}' updated`)
					return result
				} catch (error) {
					if (error instanceof ZodError) {
						reply.status(400)
						return { error: error.issues }
					}
					throw error
				}
			}
		)

		// Apply restart-tier config: clean exit, Docker brings us back.
		// SIGTERM runs the existing graceful shutdown (session flush).
		app.post('/api/config/restart', { onRequest: app.basicAuth }, async () => {
			log.warn('Restart requested via config API')

			setTimeout(() => process.kill(process.pid, 'SIGTERM'), 300)

			return { restarting: true }
		})
	})
}
