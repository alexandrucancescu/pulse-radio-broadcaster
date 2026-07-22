import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
	AppConfig,
	ConfigSection,
	configSchema,
	RESTART_SECTIONS,
	sectionSchemas,
} from './schema.js'
import env from '../env.js'
import log from '../util/log.js'

// Lives in ./data next to analytics.db so the Docker volume covers it
const DATA_DIR = resolve(process.cwd(), 'data')
const CONFIG_FILE = join(DATA_DIR, 'config.json')
// Pre-config-store DSP settings file, absorbed as the dsp section
const LEGACY_DSP_FILE = join(DATA_DIR, 'dsp.json')

// First-boot streams when STREAMS env is not provided; edit via admin UI
const DEFAULT_STREAMS: AppConfig['streams'] = [
	{ format: 'mp3', paths: ['/stream', '/stream.mp3'], bitrate: 192 },
]

/**
 * The UI-managed configuration. File wins forever once written; env is
 * only the first-boot seed (that seeding IS the prod migration path).
 * Live-tier consumers read `config()` at use-time; restart-tier sections
 * are baked in at boot and applied via save → exit → Docker restart.
 */
class ConfigStore {
	private current!: AppConfig

	public load() {
		if (existsSync(CONFIG_FILE)) {
			try {
				const parsed = configSchema.parse(
					JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
				)
				this.current = parsed
				log.info(`Configuration loaded from ${CONFIG_FILE}`)
				return
			} catch (error) {
				// A config so broken it doesn't validate must not silently
				// fall back to defaults (would put wrong streams on air)
				log.fatal(error, `Invalid config file ${CONFIG_FILE}`)
				throw error
			}
		}

		this.current = this.seedFromEnv()
		this.persist()
		log.info(`First boot: configuration seeded from env into ${CONFIG_FILE}`)
	}

	/** Build the initial config from env vars (and a legacy dsp.json) */
	private seedFromEnv(): AppConfig {
		let dsp: unknown = {}
		if (existsSync(LEGACY_DSP_FILE)) {
			try {
				dsp = JSON.parse(readFileSync(LEGACY_DSP_FILE, 'utf-8'))
				log.info('Seeding dsp section from legacy data/dsp.json')
			} catch {
				// Corrupt legacy file — defaults apply
			}
		}

		return configSchema.parse({
			station: {
				name: env.STATION_NAME,
				description: env.STATION_DESCRIPTION,
				genre: env.STATION_GENRE,
				url: env.STATION_URL,
				public: env.STATION_PUBLIC,
			},
			inputs: {
				rtp: {
					sampleRate: env.RTP_SAMPLE_RATE,
					format: env.RTP_FORMAT,
					allowedIps: env.RTP_ALLOWED_IPS ?? [],
					noDataDisconnectDelaySec: env.RTP_NO_DATA_DISCONNECT_DELAY,
					reorderDepth: env.RTP_REORDER_DEPTH,
				},
			},
			streams: env.STREAMS ?? DEFAULT_STREAMS,
			server: {
				streamMaxBufferSeconds: env.STREAM_MAX_BUFFER_SECONDS,
				streamTotalBufferMb: env.STREAM_TOTAL_BUFFER_MB,
				maxConnectionsPerIp: env.MAX_CONNECTIONS_PER_IP,
				blockedUserAgents: env.BLOCKED_USER_AGENTS ?? [],
				icyMetaint: env.ICY_METAINT,
				statsDebug: env.STATS_DEBUG,
			},
			dsp,
		})
	}

	public get(): AppConfig {
		return this.current
	}

	/**
	 * Validate and persist a full section. Returns whether the change
	 * only takes effect after a restart.
	 */
	public update<S extends ConfigSection>(
		section: S,
		value: unknown
	): { requiresRestart: boolean; config: AppConfig } {
		const parsed = sectionSchemas[section].parse(value) as AppConfig[S]

		this.current = { ...this.current, [section]: parsed }
		this.persist()

		return {
			requiresRestart: RESTART_SECTIONS.includes(section),
			config: this.current,
		}
	}

	private persist() {
		mkdirSync(DATA_DIR, { recursive: true })
		// Atomic: never leave a half-written config behind a crash
		const tmp = CONFIG_FILE + '.tmp'
		writeFileSync(tmp, JSON.stringify(this.current, null, '\t'))
		renameSync(tmp, CONFIG_FILE)
	}
}

const configStore = new ConfigStore()
configStore.load()

/** Live-tier consumers call this at use-time, never cache the result */
export function config(): AppConfig {
	return configStore.get()
}

export default configStore
