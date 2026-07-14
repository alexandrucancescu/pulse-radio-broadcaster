import RtpReceiver from '../rtp/RtpReceiver.js'
import StreamMount from './StreamMount.js'
import log from '../util/log.js'
import env, { StreamConfig } from '../env.js'

export type Interruption = {
	start: number
	end?: number
}

export default class StreamManager {
	private lastReceivedDataTime: number
	private noDataEncodersStopped: boolean

	private readonly streamMounts: StreamMount[]
	private readonly rtpReceiver: RtpReceiver
	private readonly inputFormat: {
		format: string
		sampleRate: number
	}
	private readonly streamConfigs: StreamConfig[]

	private readonly startedAt: number
	private readonly interruptions: Interruption[]

	constructor(
		rtpReceiver: RtpReceiver,
		inputFormat: {
			format: string
			sampleRate: number
		},
		streamConfigs: StreamConfig[]
	) {
		this.streamConfigs = streamConfigs
		this.inputFormat = inputFormat
		this.rtpReceiver = rtpReceiver
		this.lastReceivedDataTime = Date.now()
		this.noDataEncodersStopped = false
		this.startedAt = Date.now()
		this.interruptions = []
		this.streamMounts = this.streamConfigs.map(
			streamConfig =>
				new StreamMount(
					inputFormat,
					streamConfig,
					log.child(
						{},
						{
							msgPrefix: `[STREAM ${streamConfig.paths[0]}] `,
						}
					)
				)
		)
	}

	private initDataCheck() {
		setInterval(() => {
			const disconnectDelaySeconds = env.RTP_NO_DATA_DISCONNECT_DELAY

			if (Date.now() - this.lastReceivedDataTime > disconnectDelaySeconds * 1000) {
				if (!this.noDataEncodersStopped) {
					this.noDataEncodersStopped = true

					log.error(
						`Stopping encoders due to no RTP data for ${disconnectDelaySeconds} seconds`
					)

					this.interruptions.push({ start: Date.now() })
					this.streamMounts.forEach(mount => mount.stop())
				}
			} else {
				if (this.noDataEncodersStopped) {
					const current = this.interruptions[this.interruptions.length - 1]
					if (current && !current.end) {
						current.end = Date.now()
					}

					this.streamMounts
						.filter(mount => !mount.isActive)
						.forEach(mount => mount.start())

					this.noDataEncodersStopped = false

					log.info('Restarted encoders as RTP reconnected')
				}
			}
		}, 1000)
	}

	public start() {
		this.streamMounts.forEach(mount => mount.start())

		this.rtpReceiver.on('data', chunk => {
			this.lastReceivedDataTime = Date.now()
			this.streamMounts
				.filter(stream => stream.isActive)
				.forEach(mount => {
					mount.encoder.write(chunk)
				})
		})

		this.rtpReceiver.start()
		this.initDataCheck()
	}

	public streams(): StreamMount[] {
		return this.streamMounts
	}

	public getUptime() {
		const now = Date.now()

		const computeForWindow = (windowMs: number) => {
			const windowStart = now - windowMs
			let downtime = 0

			for (const i of this.interruptions) {
				const start = Math.max(i.start, windowStart)
				const end = i.end ? Math.min(i.end, now) : now
				if (start < end) downtime += end - start
			}

			const elapsed = Math.min(now - this.startedAt, windowMs)
			if (elapsed <= 0) return 100
			return ((elapsed - downtime) / elapsed) * 100
		}

		return {
			startedAt: this.startedAt,
			isUp: !this.noDataEncodersStopped,
			uptime1h: computeForWindow(60 * 60 * 1000),
			uptime24h: computeForWindow(24 * 60 * 60 * 1000),
			uptime7d: computeForWindow(7 * 24 * 60 * 60 * 1000),
			uptime30d: computeForWindow(30 * 24 * 60 * 60 * 1000),
			interruptions: this.interruptions.slice(-20),
		}
	}
}
