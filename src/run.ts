import { resolve } from 'node:path'
import createApp from './app.js'
import RtpReceiver from './rtp/RtpReceiver.js'
import env from './env.js'
import StreamManager from './stream/StreamManager.js'
import type ListenerStats from './stats/ListenerStats.js'
import { createWorkerProxy } from './workers/worker-rpc.js'
import log from './util/log.js'

log.info(
	{
		host: env.HOST,
		port: env.PORT,
		rtp: { host: env.RTP_HOST, port: env.RTP_PORT, format: env.RTP_FORMAT, sampleRate: env.RTP_SAMPLE_RATE },
		streams: env.STREAMS.length,
	},
	'Configuration:'
)

const rtpReceiver = new RtpReceiver({ port: env.RTP_PORT, host: env.RTP_HOST })

const streamManager = new StreamManager(
	rtpReceiver,
	{ format: env.RTP_FORMAT, sampleRate: env.RTP_SAMPLE_RATE },
	env.STREAMS
)

streamManager.start()

const listenerStats = createWorkerProxy<ListenerStats>(
	resolve(import.meta.dirname, './workers/listeners-worker.js')
)

await createApp(streamManager, listenerStats)
	.listen({
		port: env.PORT,
		host: env.HOST,
	})
	.then(() => log.info(`HTTP listening on ${env.HOST}:${env.PORT}`))
