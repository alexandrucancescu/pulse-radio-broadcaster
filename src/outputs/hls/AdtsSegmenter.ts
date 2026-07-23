import EventEmitter from 'node:events'

export type HlsSegment = {
	seq: number
	/** Precise duration in seconds, summed from frame headers */
	duration: number
	data: Buffer
	/** This segment starts after an encoder gap — playlist gets #EXT-X-DISCONTINUITY */
	discontinuity: boolean
}

// ── The ADTS header ──────────────────────────────────────────────────
// ffmpeg's adts muxer wraps every AAC frame in a 7-byte header — a mini
// packet envelope. Its fields are bit-packed and ignore byte boundaries,
// so reading them takes masking (&) and shifting (>>). Layout of the
// bits we use ('.' = fields we don't care about):
//
//   byte 0  1 1 1 1 1 1 1 1   ┐ syncword: 12 set bits marking a frame
//   byte 1  1 1 1 1 . . 0 .   ┘ start, plus layer '00' (always 0 in ADTS)
//   byte 2  . . R R R R . .     RRRR = sample-RATE INDEX (table below)
//   byte 3  . . . . . . L L   ┐
//   byte 4  L L L L L L L L   │ L×13 = frame LENGTH in bytes, header included
//   byte 5  L L L . . . . .   ┘
//   byte 6  . . . . . . B B     BB = number of raw data BLOCKS − 1
//
// The 4-bit rate field can't hold a value like 44100, so the MPEG-4 spec
// defines this fixed lookup table instead; the header stores the index.
// Index 4 → 44100 Hz, index 3 → 48000 Hz, etc.
const ADTS_SAMPLE_RATES = [
	96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
	8000, 7350,
]

const ADTS_HEADER_LEN = 7

// Each raw data block decodes to exactly 1024 PCM samples (AAC-LC spec)
const SAMPLES_PER_BLOCK = 1024

type AdtsHeader = {
	/** Total frame size in bytes, this header included */
	frameLength: number
	/** How much audio time the frame carries */
	durationSeconds: number
}

/**
 * Try to read one ADTS header at `offset`. Returns null when the bytes
 * there aren't a plausible frame start — caller slides forward to resync.
 */
function parseAdtsHeader(buf: Buffer, offset: number): AdtsHeader | null {
	// Bytes 0-1: all 12 syncword bits set and layer == 00. The mask
	// 0b11110110 keeps exactly the bits that must be fixed in byte 1
	// (ignoring the variable version/protection bits between them).
	if (buf[offset] !== 0xff) return null
	if ((buf[offset + 1] & 0b1111_0110) !== 0b1111_0000) return null

	// Frame length is a 13-bit number split across three bytes (see
	// diagram): take the low 2 bits of byte 3 as the highest digits
	// (<< 11 moves them to bit positions 12-11), all of byte 4 shifted
	// into the middle (<< 3), and the top 3 bits of byte 5 (>> 5 drops
	// the 5 bits that belong to other fields).
	const frameLength =
		((buf[offset + 3] & 0b0000_0011) << 11) |
		(buf[offset + 4] << 3) |
		(buf[offset + 5] >> 5)

	// A frame can't be shorter than its own header — corrupt, resync
	if (frameLength < ADTS_HEADER_LEN) return null

	// Byte 2: shift the rate index's 4 bits down to positions 3-0, mask
	// off the neighbouring channel bit, then look the real rate up
	const sampleRate = ADTS_SAMPLE_RATES[(buf[offset + 2] >> 2) & 0b1111] ?? 44100

	// Byte 6 low 2 bits: blocks-per-frame minus one (nearly always 0 → 1 block)
	const rawDataBlocks = (buf[offset + 6] & 0b0000_0011) + 1

	return {
		frameLength,
		durationSeconds: (SAMPLES_PER_BLOCK * rawDataBlocks) / sampleRate,
	}
}

declare interface AdtsSegmenter {
	on(event: 'segment', handler: (segment: HlsSegment) => void): this
}

/**
 * Splits an ADTS byte stream on frame boundaries and cuts segments once
 * the target duration is reached. Duration comes from the frame headers
 * themselves, so playlist EXTINF values are exact regardless of encoder
 * pacing.
 */
class AdtsSegmenter extends EventEmitter {
	private pending: Buffer = Buffer.alloc(0)
	private frames: Buffer[] = []
	private duration = 0
	private seq = 0
	private nextIsDiscontinuity = false

	constructor(private readonly targetSeconds: number) {
		super()
	}

	public write(chunk: Buffer) {
		// The encoder pipe delivers arbitrary chunk sizes — glue any
		// leftover partial frame from last time onto the front, then
		// walk the buffer frame by frame
		const buf = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk
		let offset = 0

		while (buf.length - offset >= ADTS_HEADER_LEN) {
			const header = parseAdtsHeader(buf, offset)

			// Not a frame start (garbage byte, or we landed mid-frame):
			// slide one byte forward until a syncword lines up again
			if (header === null) {
				offset++
				continue
			}

			// Frame runs past what we have so far — keep the tail as
			// pending and finish it on the next write
			if (buf.length - offset < header.frameLength) break

			this.frames.push(buf.subarray(offset, offset + header.frameLength))
			this.duration += header.durationSeconds
			offset += header.frameLength

			if (this.duration >= this.targetSeconds) this.cut()
		}

		this.pending = buf.subarray(offset)
	}

	/**
	 * Emit whatever is accumulated (a short final segment is valid HLS),
	 * drop partial-frame bytes and mark the next segment as discontinuous.
	 * Called on encoder stop/restart — the new encoder's timeline won't
	 * splice cleanly onto the old one.
	 */
	public flush() {
		this.cut()
		this.pending = Buffer.alloc(0)
		this.nextIsDiscontinuity = true
	}

	private cut() {
		if (this.frames.length === 0) return

		this.emit('segment', {
			seq: this.seq++,
			duration: this.duration,
			data: Buffer.concat(this.frames),
			discontinuity: this.nextIsDiscontinuity,
		} satisfies HlsSegment)

		this.nextIsDiscontinuity = false
		this.frames = []
		this.duration = 0
	}
}

export default AdtsSegmenter
