import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Logger } from 'pino'
import userStore from '../auth/UserStore.js'
import { signToken, TOKEN_TTL_DAYS } from '../auth/jwt.js'
import { requireAuth, SESSION_COOKIE } from '../plugins/auth.js'

type Options = {
	log: Logger
}

const loginSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
})

// Escalating per-IP delay on failed logins — enough to make online
// brute force pointless without a lockout that could be abused to
// lock the real admin out. Entries are pruned once cooled down.
const failedLogins = new Map<string, { count: number; last: number }>()
const FAIL_WINDOW_MS = 15 * 60 * 1000
const MAX_DELAY_MS = 5000

function failDelayMs(ip: string): number {
	const entry = failedLogins.get(ip)
	if (!entry) return 0
	if (Date.now() - entry.last > FAIL_WINDOW_MS) {
		failedLogins.delete(ip)
		return 0
	}
	return Math.min(entry.count * 500, MAX_DELAY_MS)
}

function recordFailure(ip: string) {
	const entry = failedLogins.get(ip)
	failedLogins.set(ip, { count: (entry?.count ?? 0) + 1, last: Date.now() })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default async function (app: FastifyInstance, { log }: Options) {
	app.post('/api/auth/login', async (req, reply) => {
		const parsed = loginSchema.safeParse(req.body)
		if (!parsed.success) {
			reply.status(400)
			return { error: 'username and password are required' }
		}

		const delay = failDelayMs(req.ip)
		if (delay > 0) await sleep(delay)

		const user = userStore.verify(parsed.data.username, parsed.data.password)

		if (!user) {
			recordFailure(req.ip)
			log.info(`Failed login for '${parsed.data.username}' from ${req.ip}`)
			reply.status(401)
			return { error: 'Wrong username or password' }
		}

		failedLogins.delete(req.ip)

		const token = await signToken({ sub: user.name, tv: user.tokenVersion })

		reply.setCookie(SESSION_COOKIE, token, {
			httpOnly: true,
			sameSite: 'lax',
			// Behind Traefik (trustProxy) this is the client-facing protocol;
			// stays false only for plain-http dev instances
			secure: req.protocol === 'https',
			path: '/',
			maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60,
		})

		log.info(`User '${user.name}' logged in from ${req.ip}`)
		return { name: user.name, role: user.role, grants: user.grants }
	})

	app.post('/api/auth/logout', async (_req, reply) => {
		reply.clearCookie(SESSION_COOKIE, { path: '/' })
		return { success: true }
	})

	// Who am I + what can I do — the UI renders nav/buttons from this
	app.get('/api/auth/me', { onRequest: requireAuth() }, async req => {
		return req.auth
	})
}
