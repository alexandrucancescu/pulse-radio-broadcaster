import * as process from 'node:process'
import EventEmitter from 'node:events'
import { createSocket, Socket as DgramSocket } from 'node:dgram'
import log from '../../util/log.js'
import { RemoteInfo } from 'node:dgram'
import parseRtpPacket, { RtpPacket } from './rtp.js'
import RtpReorderBuffer from './RtpReorderBuffer.js'
import { config } from '../../config/ConfigStore.js'
import { isIpEqualOrInCidr } from '../../util/ip.js'

// If no packet arrived for this long, assume the source restarted
// even if its SSRC did not change (fallback for encoders that reuse
// their SSRC across reboots).
const SOURCE_RESTART_MS = 1000

type ConstructorProps = {
	port: number
	host?: string
}

declare interface RtpReceiver extends EventEmitter {
	on(event: 'data', handler: (chunk: Buffer) => void): this
}

class RtpReceiver extends EventEmitter {
	private readonly port: number
	private readonly host: string
	private readonly blockedIpWarns: Record<string, number> = {}
	private udpServer: DgramSocket
	private isRunning: boolean = false
	private sourceAddress: string
	private lastPacketTime: number
	// SSRC of the current sender session; -1 = no packet seen yet.
	// Real SSRCs are unsigned 32-bit, so -1 can never collide.
	private currentSsrc: number = -1
	private readonly reorderBuffer = new RtpReorderBuffer(config().inputs.rtp.reorderDepth)

	constructor({ port, host = '0.0.0.0' }: ConstructorProps) {
		super()
		this.blockedIpWarns = {}
		this.port = port
		this.host = host
		this.lastPacketTime = -1
	}

	public start() {
		this.udpServer = createSocket('udp4')

		this.udpServer.on('listening', () => {
			log.info(`UDP server listening on ${this.host}:${this.port}`)
			this.isRunning = true
		})

		this.udpServer.on('close', () => {
			log.error('UDP server closed, reconnecting in 1s')
			this.isRunning = false

			setTimeout(() => this.start(), 1000)
		})

		this.udpServer.on('error', error => {
			log.error(error, 'UDP server error')
			process.exit(1)
		})

		this.udpServer.on('message', this.handleMessage.bind(this))

		this.udpServer.bind(this.port, this.host)
	}

	private handleMessage(data: Buffer, remoteInfo: RemoteInfo) {
		if (!isIpAllowed(remoteInfo.address)) {
			this.warnBlockedIp(remoteInfo.address)
			return
		}

		const now = Date.now()

		const packet = parseRtpPacket(data)

		this.logRtpMessage(remoteInfo, packet)

		// A new SSRC means a new sender session: sequence numbers
		// restarted at a random value (RFC 3550), so all previous
		// ordering state is meaningless.
		if (packet.ssrc !== this.currentSsrc) {
			if (this.currentSsrc !== -1) {
				log.info(
					`RTP source restarted (SSRC ${this.currentSsrc} -> ${packet.ssrc})`
				)
			}

			this.currentSsrc = packet.ssrc
			this.reorderBuffer.reset()
		} else if (now - this.lastPacketTime > SOURCE_RESTART_MS) {
			// Same SSRC after a long silence: treat as a restart anyway.
			// Whatever is buffered is the stale tail of the old stream.
			log.info(
				`RTP silence of ${now - this.lastPacketTime}ms, resetting reorder buffer`
			)

			this.reorderBuffer.reset()
		}

		this.lastPacketTime = now

		for (const ready of this.reorderBuffer.push(packet)) {
			this.emit('data', ready.payload)
		}
	}

	private logRtpMessage(remoteInfo: RemoteInfo, packet: RtpPacket) {
		const timeSinceLastPacket = Date.now() - this.lastPacketTime
		if (remoteInfo.address !== this.sourceAddress) {
			if (timeSinceLastPacket > 500) {
				log.info(`New RTP source connected from ${remoteInfo.address}`)

				this.sourceAddress = remoteInfo.address

				log.info(`New RTP source payload type = ${packet.payloadType}`)
			}
		} else if (timeSinceLastPacket > 3000) {
			log.warn(
				`RTP source reconnected after ${(timeSinceLastPacket / 1000).toFixed(1)} seconds`
			)
		}
	}

	private warnBlockedIp(ip: string) {
		const lastWarnForIp = this.blockedIpWarns[ip]

		if (lastWarnForIp && Date.now() - lastWarnForIp < 10 * 1000) {
			return
		}

		log.warn({ blockedIp: ip }, `Blocked IP ${ip} from RTP`)
		this.blockedIpWarns[ip] = Date.now()
	}

	public restart(timeout = 0) {
		this.udpServer.removeAllListeners()

		this.udpServer.close(() => {
			log.info('UDP server closed due to restart')
		})

		setTimeout(() => this.start(), timeout)
	}
}

function isIpAllowed(queriedIp: string) {
	return config().inputs.rtp.allowedIps.some(allowed => isIpEqualOrInCidr(queriedIp, allowed))
}

export default RtpReceiver
