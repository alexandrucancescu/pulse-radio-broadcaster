import { FastifyInstance } from 'fastify'
import Multipart from '@fastify/multipart'
import { requireAuth } from '../plugins/auth.js'
import type MediaLibrary from '../sources/autodj/MediaLibrary.js'
import type { MediaType } from '../sources/autodj/MediaLibrary.js'
import { Logger } from 'pino'

type Options = {
	mediaLibrary: MediaLibrary
	log: Logger
}

function isMediaType(value: string | undefined): value is MediaType {
	return value === 'song' || value === 'jingle'
}

export default async function (app: FastifyInstance, { mediaLibrary, log }: Options) {
	app.register(Multipart, {
		limits: {
			fileSize: 300 * 1024 * 1024,
			files: 50,
		},
	})

	// Reads: any authenticated user. Writes: the 'autodj' domain
	// (admin, or staff holding the autodj grant).
	const canManage = { onRequest: requireAuth('autodj') }

	app.get('/api/library', { onRequest: requireAuth() }, async () => {
		return { files: mediaLibrary.list() }
	})

	// Batch upload: multipart with any number of files; ?type= applies
	// to all files in the request (the UI sends one request per type)
	app.post<{ Querystring: { type?: string } }>(
		'/api/library/upload',
		canManage,
		async (req, reply) => {
			const type = req.query.type
			if (!isMediaType(type)) {
				reply.status(400)
				return { error: "Query param 'type' must be 'song' or 'jingle'" }
			}

			const saved: string[] = []
			const failed: { name: string; error: string }[] = []

			for await (const part of req.files()) {
				try {
					const name = await mediaLibrary.save(type, part.filename, part.file)
					saved.push(name)
					log.info(`Library upload: ${name} (${type})`)
				} catch (error) {
					failed.push({
						name: part.filename,
						error: error instanceof Error ? error.message : 'Upload failed',
					})
				}
			}

			return { saved, failed }
		}
	)

	app.post<{ Body: { name: string; from: string; to: string } }>(
		'/api/library/set-type',
		canManage,
		async (req, reply) => {
			const { name, from, to } = req.body ?? {}

			if (!name || !isMediaType(from) || !isMediaType(to)) {
				reply.status(400)
				return { error: 'name, from and to (song|jingle) are required' }
			}

			mediaLibrary.setType(name, from, to)
			return { success: true }
		}
	)

	app.delete<{ Body: { name: string; type: string } }>(
		'/api/library',
		canManage,
		async (req, reply) => {
			const { name, type } = req.body ?? {}

			if (!name || !isMediaType(type)) {
				reply.status(400)
				return { error: 'name and type (song|jingle) are required' }
			}

			mediaLibrary.remove(type, name)
			log.info(`Library delete: ${name} (${type})`)
			return { success: true }
		}
	)
}
