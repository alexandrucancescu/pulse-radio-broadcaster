import EventEmitter from 'node:events'
import type AudioSource from './AudioSource.js'
import RtpReceiver from './rtp/RtpReceiver.js'
import { config } from '../config/ConfigStore.js'
import log from '../util/log.js'

declare interface RtpSource extends EventEmitter {
	on(event: 'data', handler: (chunk: Buffer) => void): this
	on(event: 'active' | 'inactive', handler: () => void): this
}

/**
 * The studio RTP feed as an AudioSource. Passive transport: the receiver
 * just listens on UDP, so select/deselect are no-ops and reconnection is
 * simply the next packet arriving.
 *
 * Activity detection (previously in StreamManager): optimistic at boot,
 * inactive after RTP_NO_DATA_DISCONNECT_DELAY seconds of silence, active
 * again on the first packet after that.
 */
class RtpSource extends EventEmitter implements AudioSource {
	public readonly name = 'rtp'

	private readonly receiver: RtpReceiver
	private active = true
	private lastDataTime = Date.now()
	private checkInterval: NodeJS.Timeout | null = null

	constructor(options: { port: number; host?: string }) {
		super()
		this.receiver = new RtpReceiver(options)
	}

	public get isActive(): boolean {
		return this.active
	}

	public start() {
		this.receiver.on('data', chunk => {
			this.lastDataTime = Date.now()

			if (!this.active) {
				this.active = true
				log.info('RTP data resumed, source active again')
				this.emit('active')
			}

			this.emit('data', chunk)
		})

		this.receiver.start()

		const disconnectDelaySec = config().inputs.rtp.noDataDisconnectDelaySec
		const disconnectDelayMs = disconnectDelaySec * 1000
		this.checkInterval = setInterval(() => {
			if (this.active && Date.now() - this.lastDataTime > disconnectDelayMs) {
				this.active = false
				log.error(
					`No RTP data for ${disconnectDelaySec} seconds, source inactive`
				)
				this.emit('inactive')
			}
		}, 1000)
		this.checkInterval.unref()
	}

	public stop() {
		if (this.checkInterval) clearInterval(this.checkInterval)
		// The receiver has process lifetime today; a real teardown comes
		// with config-driven source recreation
	}

	// Passive source: produces whenever packets arrive, on air or not
	public select() {}
	public deselect() {}
}

export default RtpSource
