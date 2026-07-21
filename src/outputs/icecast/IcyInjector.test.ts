import { describe, it, expect } from 'vitest'
import IcyInjector from './IcyInjector.js'

// Minimal ICY client: strips metadata back out of the interleaved stream
function parseIcy(output: Buffer[], metaint: number) {
	const data = Buffer.concat(output)
	const audio: Buffer[] = []
	const titles: (string | null)[] = []
	let pos = 0

	while (pos < data.length) {
		const take = Math.min(metaint, data.length - pos)
		audio.push(data.subarray(pos, pos + take))
		pos += take
		if (take < metaint) break

		const len = data[pos] * 16
		expect(pos + 1 + len).toBeLessThanOrEqual(data.length)
		const meta = data.subarray(pos + 1, pos + 1 + len).toString().replace(/\0+$/, '')
		titles.push(len === 0 ? null : meta)
		pos += 1 + len
	}

	return { audio: Buffer.concat(audio), titles }
}

function randomAudio(size: number): Buffer {
	const buf = Buffer.alloc(size)
	for (let i = 0; i < size; i++) buf[i] = Math.floor(Math.random() * 256)
	return buf
}

describe('IcyInjector', () => {
	it('round-trips audio byte-exact across random chunk sizes', () => {
		const metaint = 64
		const source = { icyVersion: 1, icyTitle: 'Artist - Test Song' }
		const injector = new IcyInjector(metaint, source)
		const input = randomAudio(1000)

		const output: Buffer[] = []
		let pos = 0
		while (pos < input.length) {
			const size = Math.min(1 + Math.floor(Math.random() * 90), input.length - pos)
			output.push(...injector.transform(input.subarray(pos, pos + size)))
			pos += size
		}

		const { audio, titles } = parseIcy(output, metaint)
		expect(audio.equals(input)).toBe(true)
		expect(titles[0]).toBe("StreamTitle='Artist - Test Song';")
		// Same version afterwards → all remaining blocks are empty
		expect(titles.slice(1).every(t => t === null)).toBe(true)
	})

	it('splits a large burst chunk at every boundary', () => {
		const metaint = 100
		const injector = new IcyInjector(metaint, { icyVersion: 1, icyTitle: 'Burst' })
		const burst = randomAudio(metaint * 5)

		const output = injector.transform(burst)

		const { audio, titles } = parseIcy(output, metaint)
		expect(audio.equals(burst)).toBe(true)
		expect(titles.length).toBe(5)
		expect(titles[0]).toBe("StreamTitle='Burst';")
	})

	it('re-emits the title only when the version changes', () => {
		const metaint = 32
		const source = { icyVersion: 1, icyTitle: 'First' }
		const injector = new IcyInjector(metaint, source)

		const output: Buffer[] = []
		output.push(...injector.transform(randomAudio(metaint * 2)))
		source.icyVersion = 2
		source.icyTitle = "It's Second" // quote must be sanitized, not break framing
		output.push(...injector.transform(randomAudio(metaint * 2)))

		const { titles } = parseIcy(output, metaint)
		expect(titles).toEqual([
			"StreamTitle='First';",
			null,
			"StreamTitle='Its Second';",
			null,
		])
	})
})
