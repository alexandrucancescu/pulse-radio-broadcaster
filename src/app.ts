import { join } from 'node:path'
import Fastify from 'fastify'
import log from './util/log.js'
import AutoLoad from '@fastify/autoload'
import fastifyStatic from '@fastify/static'
import type SourceManager from './sources/SourceManager.js'
import type OutputManager from './outputs/OutputManager.js'
import type ListenerStats from './stats/ListenerStats.js'
import type DspChain from './dsp/DspChain.js'
import type NowPlaying from './nowPlaying.js'
import type StreamConnections from './outputs/StreamConnections.js'
import type MediaLibrary from './sources/autodj/MediaLibrary.js'
import type BrandingManager from './branding/BrandingManager.js'

export default function createApp(
	sourceManager: SourceManager,
	outputManager: OutputManager,
	listenerStats: ListenerStats,
	dspChain: DspChain,
	previewDsp: DspChain,
	nowPlaying: NowPlaying,
	connections: StreamConnections,
	mediaLibrary: MediaLibrary,
	branding: BrandingManager
) {
	const app = Fastify({
		loggerInstance: log.child(
			{},
			{
				msgPrefix: '[FASTIFY] ',
				level: 'warn',
			}
		),
		trustProxy: true,
	})

	app.register(AutoLoad, {
		dir: join(import.meta.dirname, './routes'),
		options: {
			sourceManager,
			outputManager,
			listenerStats,
			dspChain,
			previewDsp,
			nowPlaying,
			connections,
			mediaLibrary,
			branding,
			log,
		},
	})

	app.register(fastifyStatic, {
		root: join(import.meta.dirname, './public'),
		wildcard: false,
	})

	app.setNotFoundHandler((_, reply) => {
		reply.sendFile('index.html')
	})

	// Each output contributes its own endpoints (stream paths, /monitor.wav)
	outputManager.registerRoutes(app, { listenerStats, nowPlaying, connections, log })

	return app
}
