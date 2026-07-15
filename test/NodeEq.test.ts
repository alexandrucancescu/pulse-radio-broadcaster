import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import NodeEq from '../src/dsp/NodeEq'

const SAMPLE_RATE = 44100
const CHANNELS = 2

// ── helpers ──────────────────────────────────────────────────────

function makeSine(frequency: number, seconds: number, amplitude = 0.5): Buffer {
	const frames = Math.floor(SAMPLE_RATE * seconds)
	const buf = Buffer.allocUnsafe(frames * CHANNELS * 2)

	for (let i = 0; i < frames; i++) {
		const value = Math.round(
			amplitude * 32767 * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE)
		)
		for (let ch = 0; ch < CHANNELS; ch++) {
			buf.writeInt16BE(value, (i * CHANNELS + ch) * 2)
		}
	}

	return buf
}

// Deterministic noise so the ffmpeg golden test is reproducible
function makeNoise(seconds: number): Buffer {
	const frames = Math.floor(SAMPLE_RATE * seconds)
	const buf = Buffer.allocUnsafe(frames * CHANNELS * 2)

	let seed = 0x12345678
	for (let i = 0; i < frames * CHANNELS; i++) {
		// xorshift32
		seed ^= seed << 13
		seed ^= seed >>> 17
		seed ^= seed << 5
		buf.writeInt16BE(((seed >>> 16) & 0xffff) - 32768, i * 2)
	}

	return buf
}

// RMS of one channel, skipping the first `skipFrames` (filter settle time)
function rms(buf: Buffer, skipFrames = 4410): number {
	let sum = 0
	let count = 0
	const frames = buf.length / (CHANNELS * 2)

	for (let i = skipFrames; i < frames; i++) {
		const s = buf.readInt16BE(i * CHANNELS * 2)
		sum += s * s
		count++
	}

	return Math.sqrt(sum / count)
}

function makeEq(params: Partial<Parameters<NodeEq['setParams']>[0]>): NodeEq {
	const eq = new NodeEq(SAMPLE_RATE, CHANNELS)
	eq.setParams({ enabled: true, preampDb: 0, bands: [], ...params })
	return eq
}

// ── unit tests ───────────────────────────────────────────────────

describe('NodeEq', () => {
	it('passes audio through untouched when disabled', () => {
		const eq = makeEq({ enabled: false })
		const input = makeNoise(0.1)

		expect(eq.process(input)).toBe(input)
	})

	it('applies preamp gain (+6.02 dB doubles amplitude)', () => {
		const eq = makeEq({ preampDb: 20 * Math.log10(2) })
		const input = makeSine(1000, 1, 0.25)

		const ratio = rms(eq.process(input)) / rms(input)
		expect(ratio).toBeGreaterThan(1.98)
		expect(ratio).toBeLessThan(2.02)
	})

	it('peaking band boosts its center frequency and not far-away frequencies', () => {
		const band = { type: 'peaking' as const, frequency: 1000, gainDb: 6, q: 1 }

		const atCenter =
			rms(makeEq({ bands: [band] }).process(makeSine(1000, 1))) /
			rms(makeSine(1000, 1))
		// +6 dB = x1.995
		expect(atCenter).toBeGreaterThan(1.9)
		expect(atCenter).toBeLessThan(2.1)

		const farAway =
			rms(makeEq({ bands: [band] }).process(makeSine(12000, 1))) /
			rms(makeSine(12000, 1))
		expect(farAway).toBeGreaterThan(0.95)
		expect(farAway).toBeLessThan(1.1)
	})

	it('lowshelf boosts lows, leaves highs alone', () => {
		const band = { type: 'lowshelf' as const, frequency: 200, gainDb: 6, q: 1 }

		const low =
			rms(makeEq({ bands: [band] }).process(makeSine(60, 1))) /
			rms(makeSine(60, 1))
		expect(low).toBeGreaterThan(1.85)

		const high =
			rms(makeEq({ bands: [band] }).process(makeSine(8000, 1))) /
			rms(makeSine(8000, 1))
		expect(high).toBeGreaterThan(0.95)
		expect(high).toBeLessThan(1.05)
	})

	it('clamps instead of wrapping around when boost exceeds int16 range', () => {
		const eq = makeEq({ preampDb: 12 })
		const loud = makeSine(1000, 0.1, 0.9)

		const out = eq.process(loud)
		let max = 0
		for (let i = 0; i < out.length; i += 2) {
			max = Math.max(max, Math.abs(out.readInt16BE(i)))
		}

		// Clamped at full scale (int16 rails are -32768/+32767, and
		// Math.abs(-32768) = 32768), not wrapped into small values
		expect(max).toBeGreaterThanOrEqual(32767)
		expect(max).toBeLessThanOrEqual(32768)
	})

	it('produces identical output whether fed whole or in odd-sized chunks', () => {
		const band = { type: 'peaking' as const, frequency: 500, gainDb: 4, q: 2 }
		const input = makeNoise(0.5)

		const whole = makeEq({ bands: [band] }).process(input)

		const chunked = makeEq({ bands: [band] })
		const parts: Buffer[] = []
		// 998 is not a multiple of the 4-byte frame size on purpose:
		// exercises the remainder carry-over
		for (let off = 0; off < input.length; off += 998) {
			parts.push(chunked.process(input.subarray(off, Math.min(off + 998, input.length))))
		}

		expect(Buffer.concat(parts).equals(whole)).toBe(true)
	})
})

// ── golden tests against ffmpeg ──────────────────────────────────
// Same filter, same input: ffmpeg's equalizer/bass/treble use the
// same RBJ cookbook biquads, so outputs must match within rounding
// noise.

function compareBuffers(a: Buffer, b: Buffer) {
	expect(a.length).toBe(b.length)

	let maxDiff = 0
	let sumDiff = 0
	const samples = a.length / 2

	for (let i = 0; i < samples; i++) {
		const diff = Math.abs(a.readInt16BE(i * 2) - b.readInt16BE(i * 2))
		maxDiff = Math.max(maxDiff, diff)
		sumDiff += diff
	}

	return { maxDiff, meanDiff: sumDiff / samples }
}

function runFfmpeg(input: Buffer, afChain: string): Buffer {
	const dir = mkdtempSync(join(tmpdir(), 'nodeeq-'))
	const inFile = join(dir, 'in.raw')
	const outFile = join(dir, 'out.raw')

	writeFileSync(inFile, input)

	execFileSync('ffmpeg', [
		'-y',
		'-f', 's16be', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS),
		'-i', inFile,
		'-af', afChain,
		'-f', 's16be', '-acodec', 'pcm_s16be',
		outFile,
	], { stdio: 'pipe' })

	return readFileSync(outFile)
}

describe('NodeEq vs ffmpeg golden', () => {
	it('matches ffmpeg equalizer output on noise within rounding tolerance', () => {
		const input = makeNoise(1)

		const ffmpegOut = runFfmpeg(input, 'equalizer=f=1000:t=q:w=1:g=6:precision=f64')
		const nodeOut = makeEq({
			bands: [{ type: 'peaking', frequency: 1000, gainDb: 6, q: 1 }],
		}).process(input)

		const { maxDiff, meanDiff } = compareBuffers(nodeOut, ffmpegOut)

		// Identical math; only int16 rounding may differ by a few LSB
		expect(maxDiff).toBeLessThanOrEqual(16)
		expect(meanDiff).toBeLessThanOrEqual(2)

		// Sanity: the filter actually changed the audio significantly
		const { meanDiff: changed } = compareBuffers(nodeOut, input)
		expect(changed).toBeGreaterThan(100)
	})

	it('matches ffmpeg on real music with a full 3-band chain', () => {
		// 10 seconds of oud & piano, s16be 44.1kHz stereo
		const input = readFileSync(join(import.meta.dirname, 'fixtures', 'jazz-10s.pcm'))

		// lowshelf +4dB @150Hz, peaking +6dB @1kHz, highshelf -3dB @8kHz.
		// Note: ffmpeg's lowshelf/highshelf are the RBJ cookbook filters
		// we implement; its bass/treble are a different (Butterworth-
		// style) shelf design and will NOT match.
		const ffmpegOut = runFfmpeg(
			input,
			'lowshelf=f=150:t=q:w=0.8:g=4:precision=f64,' +
				'equalizer=f=1000:t=q:w=1:g=6:precision=f64,' +
				'highshelf=f=8000:t=q:w=0.9:g=-3:precision=f64'
		)

		const nodeOut = makeEq({
			bands: [
				{ type: 'lowshelf', frequency: 150, gainDb: 4, q: 0.8 },
				{ type: 'peaking', frequency: 1000, gainDb: 6, q: 1 },
				{ type: 'highshelf', frequency: 8000, gainDb: -3, q: 0.9 },
			],
		}).process(input)

		const { maxDiff, meanDiff } = compareBuffers(nodeOut, ffmpegOut)

		expect(maxDiff).toBeLessThanOrEqual(16)
		expect(meanDiff).toBeLessThanOrEqual(2)

		// Sanity: the chain audibly changed the music
		const { meanDiff: changed } = compareBuffers(nodeOut, input)
		expect(changed).toBeGreaterThan(50)
	})
})
