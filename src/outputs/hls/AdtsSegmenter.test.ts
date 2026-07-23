import { describe, expect, it } from 'vitest'
import AdtsSegmenter, { HlsSegment } from './AdtsSegmenter.js'

// Build a synthetic ADTS frame: valid 7-byte header + payload filler.
// Sample-rate index 4 = 44100 Hz, one raw data block → 1024 samples
// ≈ 23.22ms per frame.
function makeFrame(frameLength: number): Buffer {
	const frame = Buffer.alloc(frameLength, 0xaa)
	frame[0] = 0xff
	frame[1] = 0xf1 // syncword low nibble + MPEG-4, layer 00, no CRC
	frame[2] = 0x50 // profile AAC-LC, sample-rate index 4 (44100)
	frame[3] = (frameLength >> 11) & 0x03
	frame[4] = (frameLength >> 3) & 0xff
	frame[5] = (frameLength & 0x07) << 5
	frame[6] = 0x00 // one raw data block
	return frame
}

const FRAME_SECONDS = 1024 / 44100

function collect(segmenter: AdtsSegmenter): HlsSegment[] {
	const segments: HlsSegment[] = []
	segmenter.on('segment', segment => segments.push(segment))
	return segments
}

describe('AdtsSegmenter', () => {
	it('cuts a segment once the target duration is reached', () => {
		const segmenter = new AdtsSegmenter(0.1)
		const segments = collect(segmenter)

		// 0.1s / 23.22ms ≈ 4.3 → the 5th frame crosses the target
		for (let i = 0; i < 5; i++) segmenter.write(makeFrame(100))

		expect(segments).toHaveLength(1)
		expect(segments[0].seq).toBe(0)
		expect(segments[0].duration).toBeCloseTo(5 * FRAME_SECONDS, 6)
		expect(segments[0].data.length).toBe(500)
		expect(segments[0].discontinuity).toBe(false)
	})

	it('reassembles frames split across arbitrary chunk boundaries', () => {
		const segmenter = new AdtsSegmenter(0.05) // 3 frames per segment
		const segments = collect(segmenter)

		const stream = Buffer.concat([makeFrame(80), makeFrame(90), makeFrame(70)])
		// Feed in awkward slices that never align with frame boundaries
		for (let i = 0; i < stream.length; i += 7) {
			segmenter.write(stream.subarray(i, Math.min(i + 7, stream.length)))
		}

		expect(segments).toHaveLength(1)
		expect(segments[0].data.equals(stream)).toBe(true)
	})

	it('resyncs after garbage bytes between frames', () => {
		const segmenter = new AdtsSegmenter(0.05)
		const segments = collect(segmenter)

		const good = [makeFrame(80), makeFrame(80), makeFrame(80)]
		segmenter.write(good[0])
		segmenter.write(Buffer.from([0x01, 0x02, 0x03, 0x04])) // line noise
		segmenter.write(good[1])
		segmenter.write(good[2])

		expect(segments).toHaveLength(1)
		expect(segments[0].data.equals(Buffer.concat(good))).toBe(true)
	})

	it('flush emits the partial segment and flags the next as discontinuous', () => {
		const segmenter = new AdtsSegmenter(10) // never reached naturally
		const segments = collect(segmenter)

		segmenter.write(makeFrame(80))
		segmenter.flush()

		segmenter.write(makeFrame(80))
		segmenter.flush()

		expect(segments).toHaveLength(2)
		expect(segments[0].discontinuity).toBe(false)
		expect(segments[0].duration).toBeCloseTo(FRAME_SECONDS, 6)
		expect(segments[1].seq).toBe(1)
		expect(segments[1].discontinuity).toBe(true)
	})

	it('flush with nothing accumulated emits no empty segment', () => {
		const segmenter = new AdtsSegmenter(10)
		const segments = collect(segmenter)

		segmenter.flush()

		expect(segments).toHaveLength(0)
	})
})
