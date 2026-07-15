import { createHmac } from 'node:crypto'
import env from '../env.js'

export function statsAuthConfigured(): boolean {
	return Boolean(env.STATS_USERNAME && env.STATS_PASSWORD)
}

/** Validate callback for @fastify/basic-auth, shared by all protected routes */
export async function validateStatsAuth(username: string, password: string) {
	if (username === env.STATS_USERNAME && password === env.STATS_PASSWORD) {
		return
	}

	throw new Error('Unauthorized')
}

/**
 * One-way token derived from the admin password — safe to display in UI
 * because it can't be reversed to recover the password, and the server
 * only accepts it on the monitor endpoint.
 */
export function monitorToken(): string {
	return createHmac('sha256', 'pulse-monitor')
		.update(env.STATS_PASSWORD ?? '')
		.digest('hex')
		.slice(0, 32)
}
