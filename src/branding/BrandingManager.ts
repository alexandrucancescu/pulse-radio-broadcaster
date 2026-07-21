import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import type { Logger } from 'pino'
import defaultLogo from './defaultLogo.js'

// One master render, downscaled to the whole family. apple-touch-icon is
// flattened onto white — iOS composites transparency onto black otherwise.
const SIZES: { name: string; size: number; flatten?: boolean }[] = [
	{ name: 'favicon-16.png', size: 16 },
	{ name: 'favicon-32.png', size: 32 },
	{ name: 'apple-touch-icon.png', size: 180, flatten: true },
	{ name: 'icon-192.png', size: 192 },
	{ name: 'icon-512.png', size: 512 },
	{ name: 'logo.png', size: 1200 },
]

const ALLOWED_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'webp']

/**
 * Generates the favicon/artwork family from the station's uploaded logo
 * (or the bundled pulse icon when none exists). Only the uploaded source
 * survives on disk (data/branding/source.*); the generated set lives in
 * memory and is rebuilt on boot and on upload — nothing to go stale.
 */
export default class BrandingManager {
	private readonly dir: string
	private readonly log: Logger
	private readonly assets = new Map<string, Buffer>()
	private custom = false
	// Bumped on every regeneration; drives ETags and UI cache-busting
	private version = 0

	constructor(log: Logger, dir = resolve(process.cwd(), 'data', 'branding')) {
		this.dir = dir
		this.log = log
		mkdirSync(dir, { recursive: true })
	}

	public async init() {
		const source = this.findSource()
		try {
			await this.generate(source ? readFileSync(source) : defaultLogo)
			this.custom = source !== null
		} catch (error) {
			// A corrupt uploaded source must not take the favicons down
			this.log.error(error, 'Failed to generate branding from uploaded logo, using default')
			await this.generate(defaultLogo)
			this.custom = false
		}

		this.log.info(`Branding ready (${this.custom ? 'custom logo' : 'default pulse icon'})`)
	}

	public get hasCustomLogo(): boolean {
		return this.custom
	}

	public get assetVersion(): number {
		return this.version
	}

	public get(name: string): Buffer | undefined {
		return this.assets.get(name)
	}

	public async setLogo(source: Buffer, extension: string) {
		const ext = extension.toLowerCase().replace(/^\./, '')
		if (!ALLOWED_EXTENSIONS.includes(ext)) {
			throw new Error(`Unsupported logo format .${ext} (use svg, png, jpg or webp)`)
		}

		// Validate + generate BEFORE persisting, so a broken upload never
		// replaces a working source
		await this.generate(source)

		this.removeSources()
		writeFileSync(join(this.dir, `source.${ext}`), source)
		this.custom = true
	}

	public async resetToDefault() {
		this.removeSources()
		await this.generate(defaultLogo)
		this.custom = false
	}

	private async generate(source: Buffer) {
		// density upscales SVG rasterization; ignored for bitmap inputs.
		// Bitmaps smaller than a size are upscaled — unavoidable, warn-free.
		const master = await sharp(source, { density: 300 })
			.resize(1200, 1200, {
				fit: 'contain',
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.png()
			.toBuffer()

		const next = new Map<string, Buffer>()

		for (const { name, size, flatten } of SIZES) {
			let pipeline = sharp(master).resize(size, size)
			if (flatten) pipeline = pipeline.flatten({ background: '#ffffff' })
			next.set(name, await pipeline.png().toBuffer())
		}

		next.set(
			'favicon.ico',
			await pngToIco([next.get('favicon-16.png')!, next.get('favicon-32.png')!])
		)

		// Swap atomically only after the full set succeeded
		this.assets.clear()
		next.forEach((buffer, name) => this.assets.set(name, buffer))
		this.version = Date.now()
	}

	private findSource(): string | null {
		const candidates = readdirSync(this.dir).filter(name => name.startsWith('source.'))
		return candidates.length > 0 ? join(this.dir, candidates[0]) : null
	}

	private removeSources() {
		for (const name of readdirSync(this.dir)) {
			if (name.startsWith('source.')) unlinkSync(join(this.dir, name))
		}
	}
}

export function brandingSourceExists(dir = resolve(process.cwd(), 'data', 'branding')): boolean {
	return existsSync(dir) && readdirSync(dir).some(name => name.startsWith('source.'))
}
