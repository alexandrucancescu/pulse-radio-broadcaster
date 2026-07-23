import { FastifyInstance } from 'fastify'
import type OutputManager from '../outputs/OutputManager.js'
import { config } from '../config/ConfigStore.js'

type Options = {
	outputManager: OutputManager
}

export default async function (app: FastifyInstance, { outputManager }: Options) {
	app.get('/api/streams', async () => {
		return {
			station: {
				name: config().station.name,
				description: config().station.description,
				genre: config().station.genre,
			},
			streams: [
				...outputManager.icecast().map(s => ({
					type: 'http' as const,
					paths: s.config.paths,
					format: s.config.encoder.format,
					bitrate: s.config.encoder.bitrate,
					contentType: s.config.contentType,
					active: s.isActive,
					listeners: s.consumers.size,
				})),
				...outputManager.hls().map(s => ({
					type: 'hls' as const,
					paths: [s.playlistPath],
					format: s.format,
					bitrate: s.bitrate,
					contentType: undefined,
					active: s.isActive,
					listeners: s.listenerCount,
				})),
			],
		}
	})

	app.get('/robots.txt', async (_, reply) => {
		// Streams and data endpoints are pointless to crawl and well-behaved
		// bots (incl. AI crawlers) respect this. Everything else — the index
		// and dashboard UI — stays crawlable by default.
		const streamPaths = [
			...outputManager.icecast().flatMap(s => s.config.paths),
			...outputManager.hls().map(s => `${s.name}/`),
		]
		const lines = [
			'User-agent: *',
			...streamPaths.map(p => `Disallow: ${p}`),
			'Disallow: /api/',
			'Disallow: /stats',
			'Disallow: /monitor.wav',
			'Disallow: /listen.m3u',
			'Disallow: /listen.pls',
		]

		reply.header('Content-Type', 'text/plain')
		return lines.join('\n') + '\n'
	})

	app.get('/listen.m3u', async (req, reply) => {
		const host = req.hostname
		const proto = req.protocol
		const mp3 = outputManager.icecast().find(s => s.config.encoder.format === 'mp3')

		if (!mp3) {
			reply.status(404)
			return { error: 'No MP3 stream configured' }
		}

		const path = mp3.config.paths.find(p => p.endsWith('.mp3')) ?? mp3.config.paths[0]
		const lines = [
			'#EXTM3U',
			`#EXTINF:-1,${config().station.name}`,
			`${proto}://${host}${path}`,
		]

		reply.header('Content-Type', 'audio/x-mpegurl')
		reply.header('Content-Disposition', `attachment; filename="${config().station.name}.m3u"`)
		return lines.join('\n') + '\n'
	})

	app.get('/listen.pls', async (req, reply) => {
		const host = req.hostname
		const proto = req.protocol
		const streams = outputManager.icecast()
		const lines = ['[playlist]', '']

		streams.forEach((s, i) => {
			const n = i + 1
			const path = s.config.paths[0]
			const format = s.config.encoder.format
			const bitrate = s.config.encoder.bitrate ?? ''
			lines.push(`File${n}=${proto}://${host}${path}`)
			lines.push(`Title${n}=${config().station.name} (${format} ${bitrate}kbps)`)
			lines.push(`Length${n}=-1`)
			lines.push('')
		})

		lines.push(`NumberOfEntries=${streams.length}`)
		lines.push('Version=2')

		reply.header('Content-Type', 'audio/x-scpls')
		reply.header('Content-Disposition', `attachment; filename="${config().station.name}.pls"`)
		return lines.join('\n') + '\n'
	})
}
