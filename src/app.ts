import { join } from 'node:path'
import Fastify from 'fastify'
import log from './util/log.js'
import StreamManager from './stream/StreamManager.js'
import AutoLoad from '@fastify/autoload'
import { dirname } from 'desm'
import createStreamHandler from './stream/StreamHandler.js'
import type ListenerStats from './stats/ListenerStats.js'

export default function createApp(streamManager: StreamManager, listenerStats: ListenerStats) {
	const app = Fastify({
		logger: log.child(
			{},
			{
				msgPrefix: '[FASTIFY] ',
				level: 'warn',
			}
		),
		trustProxy: true,
	})

	app.register(AutoLoad, {
		dir: join(dirname(import.meta.url), './routes'),
		options: {
			streamManager,
			listenerStats,
			log,
		},
	})

	streamManager.streams().forEach(stream => {
		const handler = createStreamHandler(stream, listenerStats, log)

		stream.config.paths.forEach(path => app.get(path, handler))
	})

	return app
}
