import { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import configStore from '../config/ConfigStore.js'
import { ConfigSection, RESTART_SECTIONS, sectionSchemas } from '../config/schema.js'
import { requireAuth } from '../plugins/auth.js'
import { Logger } from 'pino'

type Options = {
	log: Logger
}

function isConfigSection(value: string): value is ConfigSection {
	return value in sectionSchemas
}

// Most config is admin-only (streams/server/inputs can take the station
// off air), but two sections map to staff grants: station identity is
// part of the branding domain, dsp belongs to the audio-processing one
const SECTION_DOMAIN: Partial<Record<ConfigSection, 'dsp' | 'branding'>> = {
	station: 'branding',
	dsp: 'dsp',
}

export default async function (app: FastifyInstance, { log }: Options) {
	app.get('/api/config', { onRequest: requireAuth() }, async () => {
		return {
			config: configStore.get(),
			restartSections: RESTART_SECTIONS,
		}
	})

	app.put<{ Params: { section: string } }>(
		'/api/config/:section',
		async (req, reply) => {
			const { section } = req.params

			if (!isConfigSection(section)) {
				reply.status(404)
				return { error: `Unknown config section '${section}'` }
			}

			const guard = requireAuth(SECTION_DOMAIN[section] ?? 'admin')
			if (await guard(req, reply)) return reply

			try {
				const result = configStore.update(section, req.body)
				log.info(`Config section '${section}' updated by '${req.auth!.name}'`)
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
	app.post(
		'/api/config/restart',
		{ onRequest: requireAuth('admin') },
		async req => {
			log.warn(`Restart requested via config API by '${req.auth!.name}'`)

			setTimeout(() => process.kill(process.pid, 'SIGTERM'), 300)

			return { restarting: true }
		}
	)
}
