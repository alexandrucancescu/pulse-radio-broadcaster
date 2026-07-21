import AudioFormat from '../encoders/AudioFormat.js'

export interface IcyTitleSource {
	icyVersion: number
	icyTitle: string
}

const ZERO_BLOCK = Buffer.of(0)
// Length byte encodes 16-byte blocks (max 255 → 4080 bytes of text);
// cap the title well below that, UTF-8 worst case included
const MAX_TITLE_CHARS = 1000

// Opus streams are Ogg-contained; interleaving ICY bytes would corrupt the
// container. All raw-frame formats (mp3, aac/adts) pass through decoders fine.
export function isIcyCapable(format: string): boolean {
	return format !== AudioFormat.OPUS
}

/**
 * Per-listener ICY metadata interleaver. After every `metaint` audio bytes
 * a metadata block is inserted: a single 0x00 when the title is unchanged,
 * otherwise `StreamTitle='...';` null-padded to a multiple of 16, prefixed
 * by a length byte (bytes / 16).
 */
export default class IcyInjector {
	private bytesUntilMeta: number
	private lastVersion = -1

	constructor(
		private readonly metaint: number,
		private readonly source: IcyTitleSource
	) {
		this.bytesUntilMeta = metaint
	}

	transform(chunk: Buffer): Buffer[] {
		const out: Buffer[] = []

		// A chunk may cross several boundaries (the connect burst usually does)
		while (chunk.length >= this.bytesUntilMeta) {
			out.push(chunk.subarray(0, this.bytesUntilMeta))
			out.push(this.metadataBlock())
			chunk = chunk.subarray(this.bytesUntilMeta)
			this.bytesUntilMeta = this.metaint
		}

		if (chunk.length > 0) {
			out.push(chunk)
			this.bytesUntilMeta -= chunk.length
		}

		return out
	}

	private metadataBlock(): Buffer {
		if (this.source.icyVersion === this.lastVersion) return ZERO_BLOCK
		this.lastVersion = this.source.icyVersion

		// ICY has no escaping — drop single quotes rather than corrupt the frame
		const title = this.source.icyTitle.replaceAll("'", '').slice(0, MAX_TITLE_CHARS)
		const text = `StreamTitle='${title}';`
		const blocks = Math.ceil(Buffer.byteLength(text) / 16)
		const block = Buffer.alloc(1 + blocks * 16) // zero-filled → null padding
		block[0] = blocks
		block.write(text, 1)

		return block
	}
}
