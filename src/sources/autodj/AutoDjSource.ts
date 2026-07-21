import EventEmitter from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { basename } from 'node:path'
import type { Logger } from 'pino'
import type AudioSource from '../AudioSource.js'
import type MediaLibrary from './MediaLibrary.js'
import type { MediaType } from './MediaLibrary.js'

// If this many files fail to decode in a row, the library is junk —
// declare inactive and let the silence keepalive take over
const MAX_CONSECUTIVE_FAILURES = 20

type QueueEntry = {
	path: string
	kind: MediaType
}

declare interface AutoDjSource extends EventEmitter {
	on(event: 'data', handler: (chunk: Buffer) => void): this
	on(event: 'active' | 'inactive', handler: () => void): this
	/** Emitted when a file starts playing; title is cleaned for display */
	on(event: 'track', handler: (title: string, kind: MediaType) => void): this
}

/**
 * File-based fallback playback. Active whenever the library has songs;
 * while selected it plays one ffmpeg decode process per file — jingle
 * first, then the shuffled library, reshuffling when it runs dry.
 * Every file is normalized to bus PCM (-re paces to realtime), so any
 * format/samplerate/channel-count in the library just works.
 */
class AutoDjSource extends EventEmitter implements AudioSource {
	public readonly name = 'autodj'

	private readonly library: MediaLibrary
	private readonly sampleRate: number
	private readonly channels: number
	private readonly log: Logger

	private active = false
	private selected = false
	private proc: ChildProcess | null = null
	private queue: QueueEntry[] = []
	private consecutiveFailures = 0

	constructor(
		library: MediaLibrary,
		format: { sampleRate: number; channels: number },
		log: Logger
	) {
		super()
		this.library = library
		this.sampleRate = format.sampleRate
		this.channels = format.channels
		this.log = log
	}

	public get isActive(): boolean {
		return this.active
	}

	public start() {
		this.refreshActive()
		this.library.on('change', () => this.refreshActive())
	}

	public stop() {
		this.deselect()
	}

	public select() {
		this.selected = true
		this.consecutiveFailures = 0
		this.queue = []
		this.playNext(true)
	}

	public deselect() {
		this.selected = false
		this.queue = []
		this.killCurrent()
	}

	private refreshActive() {
		const hasSongs = this.library.paths('song').length > 0

		if (hasSongs !== this.active) {
			this.active = hasSongs
			this.log.info(
				hasSongs ? 'Library has songs — AutoDJ available' : 'Library empty — AutoDJ unavailable'
			)
			this.emit(hasSongs ? 'active' : 'inactive')
		}
	}

	private playNext(fresh = false) {
		if (!this.selected) return

		if (this.queue.length === 0) {
			const songs = shuffle(this.library.paths('song')).map(
				(path): QueueEntry => ({ path, kind: 'song' })
			)

			if (songs.length === 0) {
				this.active = false
				this.emit('inactive')
				return
			}

			const jingles = this.library.paths('jingle')
			this.queue =
				fresh && jingles.length > 0
					? [
							{
								path: jingles[Math.floor(Math.random() * jingles.length)],
								kind: 'jingle' as const,
							},
							...songs,
						]
					: songs
		}

		const { path: file, kind } = this.queue.shift()!
		this.log.info(`Playing ${basename(file)}`)
		this.emit('track', titleFromFilename(file), kind)

		// -re paces decoding to realtime; output is normalized bus PCM
		const proc = spawn('ffmpeg', [
			'-hide_banner',
			'-loglevel', 'error',
			'-re',
			'-i', file,
			'-f', 's16be',
			'-ar', String(this.sampleRate),
			'-ac', String(this.channels),
			'pipe:1',
		])
		this.proc = proc

		let producedData = false

		proc.stdout.on('data', (chunk: Buffer) => {
			producedData = true
			this.consecutiveFailures = 0
			this.emit('data', chunk)
		})

		proc.stderr.on('data', (chunk: Buffer) => {
			this.log.warn(`ffmpeg: ${chunk.toString().trim()}`)
		})

		proc.on('error', error => {
			this.log.error(error, 'Failed to spawn ffmpeg for AutoDJ')
		})

		proc.on('close', code => {
			if (this.proc !== proc) return // killed by deselect
			this.proc = null

			if (!producedData || (code !== 0 && code !== null)) {
				this.consecutiveFailures++
				this.log.warn(
					`${basename(file)} failed (exit ${code}), ${this.consecutiveFailures} consecutive failures`
				)

				if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
					this.log.error('Too many consecutive decode failures — AutoDJ inactive')
					this.active = false
					this.emit('inactive')
					return
				}
			}

			this.playNext()
		})
	}

	private killCurrent() {
		if (!this.proc) return
		const proc = this.proc
		this.proc = null
		proc.stdout?.removeAllListeners()
		proc.kill('SIGKILL')
	}
}

/** "031 - Led Zeppelin - Stairway To Heaven.mp3" → "Led Zeppelin - Stairway To Heaven" */
function titleFromFilename(file: string): string {
	return basename(file)
		.replace(/\.[^.]+$/, '')
		.replace(/^\d+[\s.\-]+/, '')
		.trim()
}

function shuffle<T>(items: T[]): T[] {
	const result = [...items]
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[result[i], result[j]] = [result[j], result[i]]
	}
	return result
}

export default AutoDjSource
