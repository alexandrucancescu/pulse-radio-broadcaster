import { RouteHandlerMethod } from 'fastify'
import StreamMount, { Consumer } from './StreamMount.js'
import { compileHeadersForStream } from '../util/headers.js'
import type ListenerStats from '../stats/ListenerStats.js'
import type NowPlaying from '../nowPlaying.js'
import IcyInjector, { isIcyCapable } from './IcyInjector.js'
import type StreamConnections from './StreamConnections.js'
import env from '../env.js'
import { Logger } from 'pino'

const blockedAgents = (env.BLOCKED_USER_AGENTS ?? []).map(ua => ua.toLowerCase())

export default function createStreamHandler(
	stream: StreamMount,
	listenerStats: ListenerStats,
	nowPlaying: NowPlaying,
	connections: StreamConnections,
	log: Logger
): RouteHandlerMethod {
	const compiledHeaders = compileHeadersForStream(stream.config)
	const compiledIcyHeaders = compileHeadersForStream(stream.config, true)
	const icyEnabled =
		stream.config.icyMetadata ?? isIcyCapable(stream.config.encoder.format)
	// A listener whose unsent buffer exceeds STREAM_MAX_BUFFER_SECONDS of
	// audio has stalled (paused player, dead connection). Kick it: Node
	// would otherwise buffer audio for it in memory without bound — the
	// classic slow-client leak every radio server guards against (cf.
	// Icecast's queue-size limit). The default (5 min) rides out mobile
	// network blips without dropping real listeners.
	const maxBufferedBytes = stream.encoder.bitRateBytes * env.STREAM_MAX_BUFFER_SECONDS

	return async (req, reply) => {
		if (blockedAgents.length > 0) {
			const ua = (req.headers['user-agent'] ?? '').toLowerCase()
			if (blockedAgents.some(blocked => ua.includes(blocked))) {
				reply.status(403)
				return { error: 'Forbidden' }
			}
		}

		if (!stream.isActive) {
			reply.status(503)
			reply.header('Retry-After', '60')

			const accept = req.headers.accept ?? ''
			if (accept.includes('text/html')) {
				reply.type('text/html')
				return '<html><body style="background:#09090b;color:#a1a1aa;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#fafafa;font-size:1.5rem">Stream Offline</h1><p>The stream is temporarily unavailable. Please try again later.</p></div></body></html>'
			}

			return { error: 'Stream not active' }
		}

		if (
			env.MAX_CONNECTIONS_PER_IP > 0 &&
			connections.countForIp(req.ip) >= env.MAX_CONNECTIONS_PER_IP
		) {
			log.info(`Rejecting connection from ${req.ip}: per-IP limit reached`)
			reply.status(429)
			reply.header('Retry-After', '60')
			return { error: 'Too many connections from this IP' }
		}

		const connectionHandle = connections.add({
			ip: req.ip,
			streamPath: req.routeOptions.url!,
			buffered: () => reply.raw.writableLength,
			kick: () => reply.raw.destroy(),
		})

		reply.hijack()

		// ICY metadata is opt-in per client and counted per connection
		const wantsIcy = icyEnabled && req.headers['icy-metadata'] === '1'
		const injector = wantsIcy ? new IcyInjector(env.ICY_METAINT, nowPlaying) : null

		if (wantsIcy) {
			// Prevent Node from applying chunked framing to the identity body
			reply.raw.useChunkedEncodingByDefault = false
		}

		reply.raw.writeHead(200, wantsIcy ? compiledIcyHeaders : compiledHeaders)
		reply.raw.flushHeaders()

		const listenerIdPromise = listenerStats.addListener(
			req.ip,
			req.routeOptions.url!,
			req.headers['user-agent'],
			req.headers.referer
		)

		listenerIdPromise.then(id => {
			log.trace(
				`Listener ${id} connected (icy-metadata header: ${req.headers['icy-metadata'] ?? 'none'}, injecting: ${wantsIcy})`
			)

			connectionHandle.attachListenerId(id)
		})

		// The initial burst is legitimately unsent for a brand-new, healthy
		// client, so it gets an allowance on top of the stall threshold —
		// otherwise a small STREAM_MAX_BUFFER_SECONDS insta-kicks everyone
		const maxBuffered = maxBufferedBytes + stream.burstBuffer.length

		const consumer: Consumer = {
			onData: (chunk: Buffer) => {
				if (reply.raw.destroyed) return

				// NB: response.writableLength already includes the underlying
				// socket's queue — adding socket.writableLength would double-count
				const buffered = reply.raw.writableLength

				if (buffered > maxBuffered) {
					log.info(
						`Kicking stalled listener on ${req.routeOptions.url} (${buffered} bytes buffered)`
					)
					// destroy() emits 'close', which runs the normal cleanup path
					reply.raw.destroy()
					return
				}

				if (injector) {
					for (const piece of injector.transform(chunk)) reply.raw.write(piece)
				} else {
					reply.raw.write(chunk)
				}
			},
			onEnd: () => {
				if (!reply.raw.closed) {
					log.trace('Closing listener connection')
					reply.raw.end()
					reply.raw.destroy()
				}
			},
		}

		const replyCloseHandler = () => {
			stream.removeConsumer(consumer)
			reply.raw.removeAllListeners()
			connectionHandle.remove()

			listenerIdPromise.then(id => {
				log.trace(`Listener ${id} disconnected`)
				listenerStats.removeListener(id)
			})
		}

		stream.addConsumer(consumer)

		reply.raw.on('close', replyCloseHandler)
	}
}
