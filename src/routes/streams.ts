import { FastifyInstance } from 'fastify'
import type StreamManager from '../stream/StreamManager.js'
import env from '../env.js'

type Options = {
	streamManager: StreamManager
}

export default async function (app: FastifyInstance, { streamManager }: Options) {
	app.get('/api/streams', async () => {
		return {
			station: {
				name: env.STATION_NAME,
				description: env.STATION_DESCRIPTION,
				genre: env.STATION_GENRE,
			},
			streams: streamManager.streams().map(s => ({
				paths: s.config.paths,
				format: s.config.encoder.format,
				bitrate: s.config.encoder.bitrate,
				contentType: s.config.contentType,
				active: s.isActive,
				listeners: s.consumers.size,
			})),
		}
	})

	app.get('/listen.m3u', async (req, reply) => {
		const host = req.hostname
		const proto = req.protocol
		const mp3 = streamManager.streams().find(s => s.config.encoder.format === 'mp3')

		if (!mp3) {
			reply.status(404)
			return { error: 'No MP3 stream configured' }
		}

		const path = mp3.config.paths.find(p => p.endsWith('.mp3')) ?? mp3.config.paths[0]
		const lines = [
			'#EXTM3U',
			`#EXTINF:-1,${env.STATION_NAME}`,
			`${proto}://${host}${path}`,
		]

		reply.header('Content-Type', 'audio/x-mpegurl')
		reply.header('Content-Disposition', `attachment; filename="${env.STATION_NAME}.m3u"`)
		return lines.join('\n') + '\n'
	})

	app.get('/listen.pls', async (req, reply) => {
		const host = req.hostname
		const proto = req.protocol
		const streams = streamManager.streams()
		const lines = ['[playlist]', '']

		streams.forEach((s, i) => {
			const n = i + 1
			const path = s.config.paths[0]
			const format = s.config.encoder.format
			const bitrate = s.config.encoder.bitrate ?? ''
			lines.push(`File${n}=${proto}://${host}${path}`)
			lines.push(`Title${n}=${env.STATION_NAME} (${format} ${bitrate}kbps)`)
			lines.push(`Length${n}=-1`)
			lines.push('')
		})

		lines.push(`NumberOfEntries=${streams.length}`)
		lines.push('Version=2')

		reply.header('Content-Type', 'audio/x-scpls')
		reply.header('Content-Disposition', `attachment; filename="${env.STATION_NAME}.pls"`)
		return lines.join('\n') + '\n'
	})
}
