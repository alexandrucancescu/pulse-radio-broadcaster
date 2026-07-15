/**
 * 44-byte WAV header for an endless live stream: the RIFF and data
 * chunk sizes are set to 0xFFFFFFFF ("unknown"), which players treat
 * as "keep reading forever". WAV is little-endian PCM, so the s16be
 * pipeline audio must be byte-swapped before being sent after this.
 */
export function createWavStreamHeader(sampleRate: number, channels: number): Buffer {
	const header = Buffer.alloc(44)

	header.write('RIFF', 0, 'ascii')
	header.writeUInt32LE(0xffffffff, 4) // total size: unknown/endless
	header.write('WAVE', 8, 'ascii')

	header.write('fmt ', 12, 'ascii')
	header.writeUInt32LE(16, 16) // fmt chunk size
	header.writeUInt16LE(1, 20) // audio format: PCM
	header.writeUInt16LE(channels, 22)
	header.writeUInt32LE(sampleRate, 24)
	header.writeUInt32LE(sampleRate * channels * 2, 28) // byte rate
	header.writeUInt16LE(channels * 2, 32) // block align
	header.writeUInt16LE(16, 34) // bits per sample

	header.write('data', 36, 'ascii')
	header.writeUInt32LE(0xffffffff, 40) // data size: unknown/endless

	return header
}
