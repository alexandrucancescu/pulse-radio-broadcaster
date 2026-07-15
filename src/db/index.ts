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

export type Db = { drizzle: BetterSQLite3Database<typeof schema>; sqlite: DatabaseType }

/** Open a connection without touching the schema. Safe from any thread */
export function openDb(): Db {
	mkdirSync(DATA_DIR, { recursive: true })

	const sqlite = new Database(DB_PATH)
	sqlite.pragma('journal_mode = WAL')
	sqlite.pragma('busy_timeout = 5000')

	return { drizzle: drizzle(sqlite, { schema }), sqlite }
}

/**
 * Open + migrate + recover orphans + apply retention. Must run exactly
 * once per boot, in the stats worker — the only thread that owns the schema
 */
export function initDb(): Db {
	const db = openDb()
	const { sqlite } = db

	const migrationsFolder = resolve(import.meta.dirname, '../../drizzle')
	const before = sqlite.prepare('SELECT count(*) as n FROM sqlite_master WHERE name = ?').get('__drizzle_migrations') as { n: number }
	const applied = before.n ? (sqlite.prepare('SELECT count(*) as n FROM __drizzle_migrations').get() as { n: number }).n : 0

	migrate(db.drizzle, { migrationsFolder })

	const afterCount = (sqlite.prepare('SELECT count(*) as n FROM __drizzle_migrations').get() as { n: number }).n
	const newMigrations = afterCount - applied

	if (newMigrations > 0) {
		log.info(`Applied ${newMigrations} database migration(s) (${afterCount} total)`)
	} else {
		log.info(`Database up to date (${afterCount} migration(s) applied)`)
	}

	// Rows left with NULL disconnected_at come from an unclean shutdown
	// (SIGKILL/OOM — graceful shutdowns flush them). All we know is the
	// listener survived the first 30s, so close the session with that
	const orphans = sqlite
		.prepare(
			'UPDATE listener_sessions SET disconnected_at = connected_at + 30, duration_s = 30 WHERE disconnected_at IS NULL'
		)
		.run()

	if (orphans.changes > 0) {
		log.warn(`Recovered ${orphans.changes} orphaned session(s) from an unclean shutdown`)
	}

	const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
	const deleted = db.drizzle
		.delete(schema.listenerSessions)
		.where(lt(schema.listenerSessions.disconnectedAt, oneYearAgo))
		.run()

	if (deleted.changes > 0) {
		log.info(`Cleaned up ${deleted.changes} listener sessions older than 1 year`)
	}

	return db
}

/**
 * Close every still-open session row. Called synchronously from the main
 * thread's shutdown handlers on its own short-lived connection — needs no
 * state from the stats worker, and sync-only is what uncaughtException
 * handlers require
 */
export function flushOpenSessions(): number {
	const { sqlite } = openDb()

	try {
		const now = Math.floor(Date.now() / 1000)
		return sqlite
			.prepare(
				'UPDATE listener_sessions SET disconnected_at = ?, duration_s = ? - connected_at WHERE disconnected_at IS NULL'
			)
			.run(now, now).changes
	} finally {
		sqlite.close()
	}
}
