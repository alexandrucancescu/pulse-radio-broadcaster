import RtpReceiver from '../rtp/RtpReceiver.js'
import StreamMount, { StreamConfig } from './StreamMount.js'
import log from '../util/log.js'
import config from '../config.js'

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
		this.streamMounts = this.streamConfigs.map(
			streamConfig =>
				new StreamMount(
					inputFormat,
					streamConfig,
					log.child(
						{},
						{
							msgPrefix: `[STREAM MOUNT ~ ${streamConfig.paths[0]}] `,
						}
					)
				)
		)
	}

	private initDataCheck() {
		setInterval(() => {
			const disconnectDelaySeconds = config.rtp.noDataDisconnectDelay ?? 60

			if (Date.now() - this.lastReceivedDataTime > disconnectDelaySeconds * 1000) {
				if (!this.noDataEncodersStopped) {
					this.noDataEncodersStopped = true

					log.error(
						`Stopping encoders due to no RTP data for ${disconnectDelaySeconds} seconds`
					)

					this.streamMounts.forEach(mount => mount.stop())
				}
			} else {
				if (this.noDataEncodersStopped) {
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
}
