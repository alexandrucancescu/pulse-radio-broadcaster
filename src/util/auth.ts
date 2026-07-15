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
