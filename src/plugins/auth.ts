import fp from 'fastify-plugin'
import Cookie from '@fastify/cookie'
import type { FastifyReply, FastifyRequest } from 'fastify'
import userStore, { Grant } from '../auth/UserStore.js'
import { verifyToken } from '../auth/jwt.js'

export const SESSION_COOKIE = 'pulse_session'

export type AuthInfo = {
	name: string
	role: 'admin' | 'staff'
	grants: Grant[]
}

declare module 'fastify' {
	interface FastifyRequest {
		/** The authenticated user, or null for anonymous requests */
		auth: AuthInfo | null
	}
}

/**
 * Attaches `req.auth` to every request from the session cookie (or an
 * `Authorization: Bearer <jwt>` header for curl/scripts). Never rejects
 * by itself — public routes stay free, protected routes opt in with
 * `requireAuth(...)`.
 *
 * Role/grants are read from the UserStore at request time, NOT from the
 * token: permission edits and deletions apply on the next request
 * instead of living on inside week-old tokens.
 */
export default fp(async app => {
	await app.register(Cookie)

	app.addHook('onRequest', async req => {
		req.auth = null

		const bearer = req.headers.authorization
		const token =
			req.cookies[SESSION_COOKIE] ??
			(bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : undefined)

		if (!token) return

		const payload = await verifyToken(token)
		if (!payload) return

		const user = userStore.find(payload.sub)
		// tokenVersion mismatch = password changed / force-logout since signing
		if (!user || user.tokenVersion !== payload.tv) return

		req.auth = { name: user.name, role: user.role, grants: user.grants }
	})
})

/**
 * Route guard: `{ onRequest: requireAuth('dsp') }`.
 *
 * - `requireAuth()` — any authenticated user (read endpoints; staff
 *   can see everything)
 * - `requireAuth('dsp' | 'autodj' | 'branding')` — admin, or staff
 *   holding that grant
 * - `requireAuth('admin')` — admin only (config, restart, users)
 */
export function requireAuth(domain?: Grant | 'admin') {
	return async (req: FastifyRequest, reply: FastifyReply) => {
		if (!req.auth) {
			reply.status(401).send({ error: 'Not authenticated' })
			return reply
		}

		if (domain === undefined || req.auth.role === 'admin') return

		if (domain === 'admin' || !req.auth.grants.includes(domain)) {
			reply.status(403).send({ error: 'Insufficient permissions' })
			return reply
		}
	}
}
