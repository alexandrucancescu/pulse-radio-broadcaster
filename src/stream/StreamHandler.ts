import { RouteHandlerMethod } from 'fastify'
import StreamMount from './StreamMount.js'
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
				req.headers.referer,
				req.headers['user-agent']
			)
			.then(id => {
				listenerId = id
				log.trace(`Listener ${listenerId} connected`)
			})

		reply.raw.write(stream.burstBuffer)

		const dataHandler = (chunk: Buffer) => {
			reply.raw.write(chunk)
		}

		const streamEndHandler = () => {
			if (!reply.raw.closed) {
				log.trace('Closing listener connection')
				reply.raw.end()
				reply.raw.destroy()
			}
		}

		const replyCloseHandler = () => {
			log.trace(`Listener ${listenerId} disconnected`)
			stream.removeListener('data', dataHandler)
			stream.removeListener('end', streamEndHandler)

			reply.raw.removeAllListeners()

			if (listenerId) listenerStats.removeListener(listenerId)
		}

		stream.on('data', dataHandler)
		stream.on('end', streamEndHandler)

		reply.raw.on('close', replyCloseHandler)
	}
}
