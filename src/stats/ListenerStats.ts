import { lookup as ipLookup } from 'fast-geoip'
import { lookup as uaLookup } from 'useragent'

const MAX_LISTENERS_PER_IP = 5

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
	private readonly ipCounts: Map<string, number>

	private currentId = 0

	constructor() {
		this.listeners = []
		this.ipCounts = new Map()
	}

	public async addListener(
		ip: string,
		streamPath: string,
		userAgent?: string,
		referer?: string
	): Promise<number> {
		const currentCount = this.ipCounts.get(ip) ?? 0

		const listener: Listener = {
			id: this.getNextId(),
			ip,
			streamPath,
			referer,
			refererDomain: parseRefererDomain(referer),
			startTime: Date.now(),
		}

		if (currentCount < MAX_LISTENERS_PER_IP) {
			const geolocation = await ipLookup(ip)

			if (geolocation) {
				listener.geolocation = {
					country: geolocation.country,
					region: geolocation.region,
				}
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
		this.ipCounts.set(ip, currentCount + 1)

		return listener.id
	}

	public async removeListener(id: number) {
		const index = this.listeners.findIndex(listener => listener.id === id)

		if (index !== -1) {
			const ip = this.listeners[index].ip
			this.listeners.splice(index, 1)
			const count = (this.ipCounts.get(ip) ?? 1) - 1
			if (count <= 0) {
				this.ipCounts.delete(ip)
			} else {
				this.ipCounts.set(ip, count)
			}
		}
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

	public getUniqueIpCount(): number {
		return this.ipCounts.size
	}

	public getListenerCount(): number {
		let count = 0
		for (const n of this.ipCounts.values()) {
			count += Math.min(n, MAX_LISTENERS_PER_IP)
		}
		return count
	}

	public getListenersByReferer(): Record<string, number> {
		const counts: Record<string, number> = {}
		for (const l of this.listeners) {
			const domain = l.refererDomain ?? 'direct'
			counts[domain] = (counts[domain] ?? 0) + 1
		}
		return counts
	}

	public getListenersByCountry(): Record<string, number> {
		const counts: Record<string, number> = {}
		for (const l of this.listeners) {
			const country = l.geolocation?.country ?? 'Unknown'
			counts[country] = (counts[country] ?? 0) + 1
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
