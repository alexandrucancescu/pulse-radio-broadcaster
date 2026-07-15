import { RtpPacket } from './rtp.js'
import log from '../util/log.js'

// ── Sequence number math (RFC 3550) ──────────────────────────────
// RTP sequence numbers are unsigned 16-bit: after 65535 comes 0.
// They live on a circle of 65536 positions, so "newer" means
// "shorter to reach walking forward than walking backward" — like
// 1 o'clock being after 11 o'clock on a clock face.
const SEQ_SPACE = 65536

/**
 * Signed distance from b to a on the sequence number circle.
 *   > 0 → a is newer than b (by that many packets)
 *   < 0 → a is older than b
 *   = 0 → same packet
 */
export function seqDiff(a: number, b: number): number {
	// How far forward you must walk from b to reach a (0..65535)
	const forwardDistance = (a - b + SEQ_SPACE) % SEQ_SPACE

	// Less than half a lap forward → a really is ahead of b.
	// More than half a lap → the short way round is backwards,
	// so a is actually behind b: report a negative distance.
	return forwardDistance < SEQ_SPACE / 2
		? forwardDistance
		: forwardDistance - SEQ_SPACE
}

/**
 * Fixed-depth jitter buffer.
 *
 * Incoming packets are inserted sorted by sequence number. Each
 * packet stays buffered until `depth` newer packets have arrived,
 * which gives late / out-of-order packets time to slot into their
 * correct position before anything is handed to the encoders.
 *
 * There are no timers: packets leave the buffer only when a new
 * packet pushes the buffer past its depth. At ~126 packets/sec
 * (PCM 44.1kHz stereo 16-bit) a depth of 40 adds ~320ms of fixed
 * latency — irrelevant for one-way radio, and tiny next to the
 * 6-second burst buffer downstream.
 */
export default class RtpReorderBuffer {
	// Packets waiting to be emitted, sorted by seq (oldest first)
	private buffer: RtpPacket[] = []

	// Watermark: seq of the last packet handed to the receiver.
	// Anything at or before this missed its slot and is worthless.
	// -1 = nothing emitted yet.
	private lastEmittedSeq = -1

	constructor(private readonly depth: number) {}

	/**
	 * Insert a packet; returns the packets that are now ready to be
	 * emitted, in correct order (empty array most of the time during
	 * priming, exactly one packet in steady state).
	 */
	public push(packet: RtpPacket): RtpPacket[] {
		if (this.isTooLate(packet)) {
			log.debug(
				`Drop late packet SeqNum(${packet.sequenceNumber}); already emitted up to ${this.lastEmittedSeq}`
			)
			return []
		}

		if (this.isDuplicate(packet)) {
			log.debug(`Drop duplicate packet SeqNum(${packet.sequenceNumber})`)
			return []
		}

		this.insertSorted(packet)

		// Pop oldest packets until we're back at the target depth
		const ready: RtpPacket[] = []
		while (this.buffer.length > this.depth) {
			const oldest = this.buffer.shift()!
			this.lastEmittedSeq = oldest.sequenceNumber
			ready.push(oldest)
		}

		return ready
	}

	/**
	 * Source restarted: sequence numbers restart at a random value,
	 * so all ordering state is meaningless. Buffered packets are
	 * discarded — they are the stale tail of the previous stream.
	 */
	public reset() {
		this.buffer = []
		this.lastEmittedSeq = -1
	}

	private isTooLate(packet: RtpPacket): boolean {
		return (
			this.lastEmittedSeq !== -1 &&
			seqDiff(packet.sequenceNumber, this.lastEmittedSeq) <= 0
		)
	}

	private isDuplicate(packet: RtpPacket): boolean {
		return this.buffer.some(p => p.sequenceNumber === packet.sequenceNumber)
	}

	private insertSorted(packet: RtpPacket) {
		// Find the first buffered packet newer than ours, insert before
		// it. No match means ours is the newest → append at the end,
		// which is also the common case for an in-order stream.
		const index = this.buffer.findIndex(
			p => seqDiff(p.sequenceNumber, packet.sequenceNumber) > 0
		)

		if (index === -1) this.buffer.push(packet)
		else this.buffer.splice(index, 0, packet)
	}
}
