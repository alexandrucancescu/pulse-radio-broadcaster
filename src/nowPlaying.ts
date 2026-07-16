import EventEmitter from 'node:events'

export type Song = {
	isSong: true
	title: string
	artist: string
	album?: string
	year?: number
	startedAt: string
}

export type Event = {
	isSong: false
	title: string
	startedAt: string
}

export type NowPlayingEntry = Song | Event

const HISTORY_SIZE = 20

const CleanRegexes = [
	/[ \t]+$/g,
	/(\r\n)/g,
	/\.mp3$/gi,
]

declare interface NowPlaying {
	on(event: 'update', listener: (entry: NowPlayingEntry) => void): this
	emit(event: 'update', entry: NowPlayingEntry): boolean
}

class NowPlaying extends EventEmitter {
	private current: NowPlayingEntry | null = null
	private history: NowPlayingEntry[] = []

	handleUpdate(raw: string) {
		const entry = NowPlaying.parse(raw)

		if (this.current) {
			this.history.unshift(this.current)
			if (this.history.length > HISTORY_SIZE) this.history.length = HISTORY_SIZE
		}

		this.current = entry
		this.emit('update', entry)
	}

	getCurrent(): NowPlayingEntry | null {
		return this.current
	}

	getHistory(): NowPlayingEntry[] {
		return this.history
	}

	private static clean(raw: string): string {
		return CleanRegexes.reduce((s, re) => s.replaceAll(re, ''), raw)
			.replaceAll(/`\s*`*/gm, "'")
			.replaceAll(/'+/gm, "'")
			.trim()
	}

	// Format: "Artist - Title [Album, Year]"  or  "$$Event name"
	private static parse(raw: string): NowPlayingEntry {
		const cleaned = NowPlaying.clean(raw)
		const now = new Date().toISOString()

		if (cleaned.startsWith('$$')) {
			return { isSong: false, title: cleaned.slice(2).trim(), startedAt: now }
		}

		const [artist, ...restParts] = cleaned.split(' - ')
		const rest = restParts.join(' - ')

		if (!rest) {
			return { isSong: true, title: cleaned, artist: '', startedAt: now }
		}

		const bracketIdx = rest.indexOf(' [')
		let title: string
		let album: string | undefined
		let year: number | undefined

		if (bracketIdx !== -1) {
			title = rest.slice(0, bracketIdx)
			const details = rest.slice(bracketIdx + 2).replace(/]$/, '')
			const [albumPart, yearPart] = details.split(', ')
			album = albumPart || undefined
			const parsed = parseInt(yearPart)
			year = isNaN(parsed) ? undefined : parsed
		} else {
			title = rest
		}

		return { isSong: true, artist: artist.trim(), title: title.trim(), album, year, startedAt: now }
	}
}

export default NowPlaying
