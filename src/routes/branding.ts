import { FastifyInstance } from 'fastify'
import Multipart from '@fastify/multipart'
import { extname } from 'node:path'
import { requireAuth } from '../plugins/auth.js'
import type BrandingManager from '../branding/BrandingManager.js'
import { config } from '../config/ConfigStore.js'
import { Logger } from 'pino'

type Options = {
	branding: BrandingManager
	log: Logger
}

const CONTENT_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.ico': 'image/x-icon',
}

// Served at stable root URLs referenced from the SPA's <head>; uploads
// apply live because the manager regenerates the in-memory set
const PUBLIC_ASSETS = [
	'favicon.ico',
	'favicon-16.png',
	'favicon-32.png',
	'apple-touch-icon.png',
	'icon-192.png',
	'icon-512.png',
	'logo.png',
]

export default async function (app: FastifyInstance, { branding, log }: Options) {
	for (const name of PUBLIC_ASSETS) {
		app.get(`/${name}`, async (req, reply) => {
			const asset = branding.get(name)

			if (!asset) {
				reply.status(404)
				return { error: 'Not found' }
			}

			// no-cache = browsers revalidate every time (cheap 304s), so a
			// replaced logo shows up immediately instead of after max-age
			const etag = `"${branding.assetVersion}"`
			reply.header('Cache-Control', 'no-cache')
			reply.header('ETag', etag)

			if (req.headers['if-none-match'] === etag) {
				reply.status(304)
				return null
			}

			reply.header('Content-Type', CONTENT_TYPES[extname(name)] ?? 'image/png')
			return asset
		})
	}

	// Dynamic so a station rename is reflected without regenerating anything
	app.get('/site.webmanifest', async (_, reply) => {
		const station = config().station

		reply.header('Content-Type', 'application/manifest+json')
		reply.header('Cache-Control', 'no-cache')
		return {
			name: station.name,
			short_name: station.name,
			description: station.description,
			icons: [
				{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
				{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
			],
			theme_color: '#18181b',
			background_color: '#09090b',
			display: 'browser',
		}
	})

	app.register(Multipart, {
		limits: { fileSize: 20 * 1024 * 1024, files: 1 },
	})

	// Reads: any authenticated user. Writes: the 'branding' domain
	// (admin, or staff holding the branding grant).
	const canBrand = { onRequest: requireAuth('branding') }

	app.get('/api/branding', { onRequest: requireAuth() }, async () => {
		return { hasCustomLogo: branding.hasCustomLogo, version: branding.assetVersion }
	})

	app.post('/api/branding/logo', canBrand, async (req, reply) => {
		const part = await req.file()

		if (!part) {
			reply.status(400)
			return { error: 'No file uploaded' }
		}

		try {
			await branding.setLogo(await part.toBuffer(), extname(part.filename))
			log.info(`Station logo replaced (${part.filename})`)
			return { success: true, hasCustomLogo: true }
		} catch (error) {
			reply.status(400)
			return {
				error: error instanceof Error ? error.message : 'Could not process the logo',
			}
		}
	})

	app.delete('/api/branding/logo', canBrand, async () => {
		await branding.resetToDefault()
		log.info('Station logo reset to default')
		return { success: true, hasCustomLogo: false }
	})
}
