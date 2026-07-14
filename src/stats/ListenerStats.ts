import { lookup as ipLookup } from 'fast-geoip'
import { lookup as uaLookup } from 'useragent'

export type Listener = {
	id: number
	ip: string
	geolocation?: {
		country: string
		region: string
	}
	referer?: string
	refererDomain?: string
	userAgent?: {
		family: string
		major: string
	}
	startTime: number
	streamPath: string
}

export default class ListenerStats {
	private readonly listeners: Listener[]

	private currentId = 0

	constructor() {
		this.listeners = []
	}

	public async addListener(
		ip: string,
		streamPath: string,
		userAgent?: string,
		referer?: string
	): Promise<number> {
		const listener: Listener = {
			id: this.getNextId(),
			ip,
			streamPath,
			referer,
			refererDomain: parseRefererDomain(referer),
			startTime: Date.now(),
		}

		const geolocation = await ipLookup(ip)

		if (geolocation) {
			listener.geolocation = {
				country: geolocation.country,
				region: geolocation.region,
			}
		}

		if (userAgent) {
			const parsedUa = uaLookup(userAgent)
			listener.userAgent = {
				family: parsedUa.family,
				major: parsedUa.major,
			}
		}

		this.listeners.push(listener)

		return listener.id
	}

	public async removeListener(id: number) {
		const index = this.listeners.findIndex(listener => listener.id === id)

		if (index !== -1) this.listeners.splice(index, 1)
	}

	private getNextId(): number {
		if (this.currentId >= Number.MAX_SAFE_INTEGER) {
			this.currentId = 0
		}

		return this.currentId++
	}

	public async getAllListeners(): Promise<Listener[]> {
		return this.listeners
	}

	public async getListenersByReferer(): Promise<Record<string, number>> {
		const counts: Record<string, number> = {}
		for (const l of this.listeners) {
			const domain = l.refererDomain ?? 'direct'
			counts[domain] = (counts[domain] ?? 0) + 1
		}
		return counts
	}
}

function parseRefererDomain(referer?: string): string | undefined {
	if (!referer) return undefined
	try {
		return new URL(referer).hostname
	} catch {
		return undefined
	}
}
