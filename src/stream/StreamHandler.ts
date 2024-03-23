import { RouteHandlerMethod } from 'fastify'
import StreamMount, { Consumer } from './StreamMount.js'
import { compileHeadersForStream } from '../util/headers.js'
import type ListenerStats from '../stats/ListenerStats.js'
import { Logger } from 'pino'

export default function createStreamHandler(
	stream: StreamMount,
	listenerStats: ListenerStats,
	log: Logger
): RouteHandlerMethod {
	const compiledHeaders = compileHeadersForStream(stream.config)

	return async (req, reply) => {
		if (!stream.isActive) {
			reply.status(503)
			reply.header('Retry-After', '60')

			return {
				error: 'Stream not active',
			}
		}

		reply.hijack()

		reply.raw.writeHead(200, compiledHeaders)
		reply.raw.flushHeaders()

		let listenerId: number

		listenerStats
			.addListener(
				req.ip,
				req.routeOptions.url!,
				req.headers['user-agent'],
				req.headers.referer
			)
			.then(id => {
				listenerId = id
				log.trace(`Listener ${listenerId} connected`)
			})

		const consumer: Consumer = {
			onData: (chunk: Buffer) => reply.raw.write(chunk),
			onEnd: () => {
				if (!reply.raw.closed) {
					log.trace('Closing listener connection')
					reply.raw.end()
					reply.raw.destroy()
				}
			},
		}

		const replyCloseHandler = () => {
			log.trace(`Listener ${listenerId} disconnected`)
			stream.removeConsumer(consumer)

			reply.raw.removeAllListeners()

			if (listenerId) listenerStats.removeListener(listenerId)
		}

		stream.addConsumer(consumer)

		reply.raw.on('close', replyCloseHandler)
	}
}
