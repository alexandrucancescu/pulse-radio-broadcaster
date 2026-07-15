import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { lt } from 'drizzle-orm'
import * as schema from './schema.js'
import log from '../util/log.js'

const DATA_DIR = resolve(process.cwd(), 'data')
const DB_PATH = resolve(DATA_DIR, 'analytics.db')

export function initDb(): Db {
	mkdirSync(DATA_DIR, { recursive: true })

	const sqlite = new Database(DB_PATH)
	sqlite.pragma('journal_mode = WAL')
	sqlite.pragma('busy_timeout = 5000')

	const db = drizzle(sqlite, { schema })

	const migrationsFolder = resolve(import.meta.dirname, '../../drizzle')
	const before = sqlite.prepare('SELECT count(*) as n FROM sqlite_master WHERE name = ?').get('__drizzle_migrations') as { n: number }
	const applied = before.n ? (sqlite.prepare('SELECT count(*) as n FROM __drizzle_migrations').get() as { n: number }).n : 0

	migrate(db, { migrationsFolder })

	const afterCount = (sqlite.prepare('SELECT count(*) as n FROM __drizzle_migrations').get() as { n: number }).n
	const newMigrations = afterCount - applied

	if (newMigrations > 0) {
		log.info(`Applied ${newMigrations} database migration(s) (${afterCount} total)`)
	} else {
		log.info(`Database up to date (${afterCount} migration(s) applied)`)
	}

	const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
	const deleted = db
		.delete(schema.listenerSessions)
		.where(lt(schema.listenerSessions.disconnectedAt, oneYearAgo))
		.run()

	if (deleted.changes > 0) {
		log.info(`Cleaned up ${deleted.changes} listener sessions older than 1 year`)
	}

	return { drizzle: db, sqlite }
}

export type Db = { drizzle: BetterSQLite3Database<typeof schema>; sqlite: DatabaseType }
