import createApp from './app.js'
import RtpReceiver from './rtp/RtpReceiver.js'
import config from './config.js'
import StreamManager from './stream/StreamManager.js'
import type ListenerStats from './stats/ListenerStats.js'
import { createWorkerProxy } from './workers/worker-rpc.js'
import { dirname } from 'desm'
import { resolve } from 'path'
import log from './util/log.js'

log.info(config, 'Compiled configuration:')

const _dirname = dirname(import.meta.url)

const rtpReceiver = new RtpReceiver({ port: config.rtp.port })

const streamManager = new StreamManager(rtpReceiver, config.rtp.audio, config.streams)

streamManager.start()

const listenerStats = createWorkerProxy<ListenerStats>(
	resolve(_dirname, './stats-worker/listeners-worker.js')
)

await createApp(streamManager, listenerStats).listen({
	port: config.port,
	host: config.host ?? '0.0.0.0',
})
