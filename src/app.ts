import { join } from 'node:path'
import Fastify from 'fastify'
import log from './util/log.js'
import StreamManager from './stream/StreamManager.js'
import AutoLoad from '@fastify/autoload'
import fastifyStatic from '@fastify/static'
import createStreamHandler from './stream/StreamHandler.js'
import type ListenerStats from './stats/ListenerStats.js'

export default function createApp(
	streamManager: StreamManager,
	listenerStats: ListenerStats
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
			streamManager,
			listenerStats,
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

	streamManager.streams().forEach(stream => {
		const handler = createStreamHandler(stream, listenerStats, log)

		stream.config.paths.forEach(path => app.get(path, handler))
	})

	return app
}
