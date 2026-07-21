import EventEmitter from 'node:events'
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	statSync,
	unlinkSync,
} from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { basename, extname, join, resolve } from 'node:path'

export type MediaType = 'song' | 'jingle'

export type MediaFile = {
	name: string
	type: MediaType
	sizeBytes: number
	modifiedAt: number
}

// Anything ffmpeg decodes reliably; the AutoDJ normalizes to bus PCM anyway
const ALLOWED_EXTENSIONS = new Set([
	'.mp3',
	'.aac',
	'.m4a',
	'.ogg',
	'.opus',
	'.flac',
	'.wav',
])

const TYPE_DIRS: Record<MediaType, string> = {
	song: 'songs',
	jingle: 'jingles',
}

declare interface MediaLibrary {
	on(event: 'change', handler: () => void): this
	emit(event: 'change'): boolean
}

/**
 * The AutoDJ's file store. The filesystem IS the database: type is
 * encoded by directory (data/library/songs, data/library/jingles), so
 * there is no metadata file to drift. Local persistent volume only —
 * fallback must have zero remote dependencies at play time.
 */
class MediaLibrary extends EventEmitter {
	private readonly baseDir: string

	constructor(baseDir = resolve(process.cwd(), 'data', 'library')) {
		super()
		this.baseDir = baseDir
		for (const dir of Object.values(TYPE_DIRS)) {
			mkdirSync(join(baseDir, dir), { recursive: true })
		}
	}

	public list(): MediaFile[] {
		const types: MediaType[] = ['song', 'jingle']
		return types.flatMap(type =>
			readdirSync(this.dirFor(type))
				.filter(name => ALLOWED_EXTENSIONS.has(extname(name).toLowerCase()))
				.map(name => {
					const stats = statSync(join(this.dirFor(type), name))
					return {
						name,
						type,
						sizeBytes: stats.size,
						modifiedAt: stats.mtimeMs,
					}
				})
		)
	}

	public paths(type: MediaType): string[] {
		return readdirSync(this.dirFor(type))
			.filter(name => ALLOWED_EXTENSIONS.has(extname(name).toLowerCase()))
			.map(name => join(this.dirFor(type), name))
	}

	public isAllowedFilename(filename: string): boolean {
		return ALLOWED_EXTENSIONS.has(extname(filename).toLowerCase())
	}

	public async save(type: MediaType, filename: string, source: Readable) {
		const name = sanitize(filename)

		if (!this.isAllowedFilename(name)) {
			throw new Error(`Unsupported file type: ${name}`)
		}

		await pipeline(source, createWriteStream(join(this.dirFor(type), name)))
		this.emit('change')

		return name
	}

	public remove(type: MediaType, filename: string) {
		const path = this.safePath(type, filename)
		if (existsSync(path)) unlinkSync(path)
		this.emit('change')
	}

	public setType(filename: string, from: MediaType, to: MediaType) {
		if (from === to) return
		renameSync(this.safePath(from, filename), this.safePath(to, filename))
		this.emit('change')
	}

	private dirFor(type: MediaType): string {
		return join(this.baseDir, TYPE_DIRS[type])
	}

	/** basename() blocks path traversal from user-supplied names */
	private safePath(type: MediaType, filename: string): string {
		return join(this.dirFor(type), basename(filename))
	}
}

function sanitize(filename: string): string {
	return basename(filename).replace(/[^\p{L}\p{N} ._()\-\[\]&']/gu, '_')
}

export default MediaLibrary
