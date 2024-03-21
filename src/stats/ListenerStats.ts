import { lookup } from 'fast-geoip'

export type Listener = {
	id: number
	ip: string
	geolocation?: {
		country: string
		region: string
	}
	referer?: string
	userAgent?: string
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
		const geolocation = await lookup(ip)

		const id = this.getNextId()

		this.listeners.push({
			id,
			ip,
			geolocation: geolocation
				? {
						country: geolocation.country,
						region: geolocation.region,
					}
				: undefined,
			referer,
			startTime: Date.now(),
			userAgent,
			streamPath,
		})

		return id
	}

	public async removeListener(id: number) {
		const index = this.listeners.findIndex(listener => listener.id === id)

		if (index) this.listeners.splice(index, 1)
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
}
