import { resolve } from 'node:path'
import createApp from './app.js'
import RtpReceiver from './rtp/RtpReceiver.js'
import env from './env.js'
import StreamManager from './stream/StreamManager.js'
import DspChain from './dsp/DspChain.js'
import MonitorMount from './stream/MonitorMount.js'
import type ListenerStats from './stats/ListenerStats.js'
import { createWorkerProxy } from './workers/worker-rpc.js'
import { flushOpenSessions } from './db/index.js'
import log from './util/log.js'

// Log the full resolved configuration at startup, minus the secret
const { STATS_PASSWORD, STREAMS, ...loggableConfig } = env
log.info({ ...loggableConfig, streams: STREAMS.length }, 'Configuration:')

const rtpReceiver = new RtpReceiver({ port: env.RTP_PORT, host: env.RTP_HOST })

const dspChain = new DspChain({ sampleRate: env.RTP_SAMPLE_RATE, channels: 2 })

rtpReceiver.on('data', chunk => dspChain.write(chunk))

const monitorMount = new MonitorMount(
	env.RTP_SAMPLE_RATE,
	2,
	log.child({}, { msgPrefix: '[MONITOR] ' })
)

dspChain.on('data', chunk => monitorMount.write(chunk))

const streamManager = new StreamManager(
	dspChain,
	{ format: env.RTP_FORMAT, sampleRate: env.RTP_SAMPLE_RATE },
	env.STREAMS
)

streamManager.start()
dspChain.start()
rtpReceiver.start()

const listenerStats = createWorkerProxy<ListenerStats>(
	resolve(import.meta.dirname, './workers/listeners-worker.js')
)

await createApp(streamManager, listenerStats, dspChain, monitorMount)
	.listen({
		port: env.PORT,
		host: env.HOST,
	})
	.then(() => log.info(`HTTP listening on ${env.HOST}:${env.PORT}`))

// ── Graceful shutdown ────────────────────────────────────────────
// Fully synchronous: closes all still-open session rows on a dedicated
// short-lived connection (SQLite in WAL mode handles the second
// connection fine). No worker RPC involved, so it's also legal inside
// uncaughtException, which requires sync-only cleanup.

let shuttingDown = false

function shutdown(reason: string, exitCode: number) {
	if (shuttingDown) return
	shuttingDown = true

	log.info(`${reason} received, flushing active listener sessions`)

	try {
		const flushed = flushOpenSessions()
		log.info(`Flushed ${flushed} active session(s)`)
	} catch (error) {
		log.error(error, 'Failed to flush active sessions')
	}

	process.exit(exitCode)
}

process.on('SIGTERM', () => shutdown('SIGTERM', 0))
process.on('SIGINT', () => shutdown('SIGINT', 0))
process.on('uncaughtException', error => {
	log.fatal(error, 'Uncaught exception')
	shutdown('uncaughtException', 1)
})
process.on('unhandledRejection', reason => {
	log.fatal({ reason }, 'Unhandled rejection')
	shutdown('unhandledRejection', 1)
})
