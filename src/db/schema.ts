import { integer, text, index, sqliteTable } from 'drizzle-orm/sqlite-core'

export const listenerSessions = sqliteTable(
	'listener_sessions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ip: text('ip').notNull(),
		country: text('country'),
		referer: text('referer'),
		stream: text('stream').notNull(),
		connectedAt: integer('connected_at', { mode: 'timestamp' }).notNull(),
		// NULL while the session is still active (row is inserted 30s after
		// connect, finalized on disconnect or graceful shutdown)
		disconnectedAt: integer('disconnected_at', { mode: 'timestamp' }),
		durationS: integer('duration_s'),
	},
	(table) => [
		index('idx_disconnected_at').on(table.disconnectedAt),
		index('idx_stream_disconnected').on(table.stream, table.disconnectedAt),
	]
)

// Generic scalar state that must survive restarts and data retention,
// e.g. the all-time peak concurrent listeners record
export const meta = sqliteTable('meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
})
