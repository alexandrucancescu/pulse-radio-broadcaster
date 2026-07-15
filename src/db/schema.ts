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
		disconnectedAt: integer('disconnected_at', { mode: 'timestamp' }).notNull(),
		durationS: integer('duration_s').notNull(),
	},
	(table) => [
		index('idx_disconnected_at').on(table.disconnectedAt),
		index('idx_stream_disconnected').on(table.stream, table.disconnectedAt),
	]
)
