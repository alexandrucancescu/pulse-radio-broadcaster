import log from '../util/log.js'
import { createSocket, Socket as DgramSocket } from 'dgram'
import { RemoteInfo } from 'node:dgram'
import parseRtpPacket, { RtpPacket } from './rtp.js'
import * as process from 'process'
import config from '../config.js'
import ip from 'ip'
import EventEmitter from 'events'

type ConstructorProps = {
	port: number
	host?: string
}

declare interface RtpReceiver {
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
	private lastSequenceNumber: number = -1

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
			log.error('UDP server closed')
			this.isRunning = false

			this.removeAllListeners()

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

		//Drop out of order packet; Take into consideration sequence number rollover: 65535 + 1 = 0
		//TODO improve condition
		if (
			this.lastSequenceNumber > packet.sequenceNumber &&
			this.lastSequenceNumber - packet.sequenceNumber < 3000 &&
			now - this.lastPacketTime < 1000
		) {
			log.debug(
				`Drop packet PrevSeqNum(${this.lastSequenceNumber}) - SeqNum(${packet.sequenceNumber}) = Diff(${this.lastSequenceNumber - packet.sequenceNumber}); TimeDiffMs=${now - this.lastPacketTime}`
			)

			return
		}

		this.lastPacketTime = now
		this.lastSequenceNumber = packet.sequenceNumber

		this.emit('data', packet.payload)
	}

	private logRtpMessage(remoteInfo: RemoteInfo, packet: RtpPacket) {
		//Log only if it's new source or no message was received for last 500ms
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
	return config.rtp.allowedIps.some(ipOrCidrSubnet => {
		try {
			return ip.isEqual(queriedIp, ipOrCidrSubnet)
		} catch (_) {
			//ip is in CIDR notation so it trows error
			try {
				return ip.cidrSubnet(ipOrCidrSubnet).contains(queriedIp)
			} catch (err) {
				return false
			}
		}
	})
}

export default RtpReceiver
