import { resolve } from 'node:path'
import createApp from './app.js'
import env from './env.js'
import DspChain from './dsp/DspChain.js'
import RtpSource from './sources/RtpSource.js'
import AutoDjSource from './sources/autodj/AutoDjSource.js'
import MediaLibrary from './sources/autodj/MediaLibrary.js'
import SilenceSource from './sources/SilenceSource.js'
import SourceManager from './sources/SourceManager.js'
import OutputManager from './outputs/OutputManager.js'
import IcecastOutput from './outputs/icecast/IcecastOutput.js'
import HlsOutput from './outputs/hls/HlsOutput.js'
import MonitorOutput from './outputs/monitor/MonitorOutput.js'
import StreamConnections from './outputs/StreamConnections.js'
import { startBufferBudget } from './outputs/BufferBudget.js'
import type ListenerStats from './stats/ListenerStats.js'
import { createWorkerProxy } from './workers/worker-rpc.js'
import { flushOpenSessions } from './db/index.js'
import NowPlayingState from './nowPlaying.js'
import BrandingManager from './branding/BrandingManager.js'
import configStore, { config } from './config/ConfigStore.js'
import reaper from './system/PatientReaper.js'
import log from './util/log.js'

// Log bootstrap env (minus secrets) and the UI-managed config summary
const { STATS_PASSWORD, METADATA_TOKEN, STREAMS, ...loggableConfig } = env
log.info({ ...loggableConfig, streams: config().streams.length }, 'Configuration:')

const rtpConfig = config().inputs.rtp

// ── Sources: everything that can put the station on air ─────────────
// Priority chain: studio RTP feed → AutoDJ file playback → silence
// keepalive (cannot fail — dead air is structurally impossible)
const rtpSource = new RtpSource({ port: env.RTP_PORT, host: env.RTP_HOST })

const mediaLibrary = new MediaLibrary()

const autoDjSource = new AutoDjSource(
	mediaLibrary,
	{ sampleRate: rtpConfig.sampleRate, channels: 2 },
	log.child({}, { msgPrefix: '[AUTODJ] ' })
)

const silenceSource = new SilenceSource(rtpConfig.sampleRate, 2)

const sourceManager = new SourceManager(
	[rtpSource, autoDjSource, silenceSource],
	rtpConfig.noDataDisconnectDelaySec,
	config().inputs.switchBackDelaySec
)

// ── DSP: the bus between sources and outputs ─────────────────────────
// Two chains: 'live' is on air; 'preview' is heard on /monitor.wav and
// only receives committed settings via POST /api/dsp/commit
const dspFormat = { sampleRate: rtpConfig.sampleRate, channels: 2 }

const dspChain = new DspChain(dspFormat, config().dsp, settings =>
	configStore.update('dsp', settings)
)
const previewDsp = new DspChain(dspFormat, config().dsp)

// ── Outputs: everything that consumes the bus ────────────────────────
const inputFormat = { format: rtpConfig.format, sampleRate: rtpConfig.sampleRate }

const icecastOutputs = config()
	.streams.filter(streamConfig => streamConfig.type !== 'hls')
	.map(
		streamConfig =>
			new IcecastOutput(
				inputFormat,
				streamConfig,
				log.child({}, { msgPrefix: `[STREAM ${streamConfig.paths[0]}] ` })
			)
	)

const hlsOutputs = config()
	.streams.filter(streamConfig => streamConfig.type === 'hls')
	.map(
		streamConfig =>
			new HlsOutput(
				inputFormat,
				streamConfig,
				log.child({}, { msgPrefix: `[HLS ${streamConfig.paths[0]}] ` })
			)
	)

const monitorOutput = new MonitorOutput(
	rtpConfig.sampleRate,
	2,
	log.child({}, { msgPrefix: '[MONITOR] ' })
)

sourceManager.on('data', chunk => {
	dspChain.write(chunk)
	// The preview chain only burns CPU while someone is listening to it
	if (monitorOutput.clientCount > 0) previewDsp.write(chunk)
})

const outputManager = new OutputManager({ live: dspChain, preview: previewDsp }, [
	...icecastOutputs,
	...hlsOutputs,
	monitorOutput,
])

sourceManager.on('active', () => outputManager.setSourceActive(true))
sourceManager.on('inactive', () => outputManager.setSourceActive(false))

// Follows every spawned ffmpeg for the dashboard; never kills anything
reaper.start()

outputManager.start()
dspChain.start()
previewDsp.start()
sourceManager.start()

// ── HTTP, stats, listener protection ─────────────────────────────────
const listenerStats = createWorkerProxy<ListenerStats>(
	resolve(import.meta.dirname, './workers/listeners-worker.js')
)

const nowPlaying = new NowPlayingState()

// AutoDJ tracks feed the same now-playing pipeline the studio tracker
// uses, so ICY titles keep updating during fallback playback. Jingles
// are skipped — the previous song title outlives a 10-second sweeper.
autoDjSource.on('track', (title, kind) => {
	if (kind === 'song') nowPlaying.handleUpdate(title)
})

const branding = new BrandingManager(log.child({}, { msgPrefix: '[BRANDING] ' }))
await branding.init()

const connections = new StreamConnections()
startBufferBudget(connections, () => config().server.streamTotalBufferMb * 1024 * 1024, log)

await createApp(sourceManager, outputManager, listenerStats, dspChain, previewDsp, nowPlaying, connections, mediaLibrary, branding)
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
