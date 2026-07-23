import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Logger } from 'pino'
import userStore, { GRANTS, ROLES, UserStoreError } from '../auth/UserStore.js'
import { requireAuth } from '../plugins/auth.js'

type Options = {
	log: Logger
}

const createSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9._-]+$/, 'Letters, digits, dot, dash and underscore only'),
	password: z.string().min(8).max(128),
	role: z.enum(ROLES),
	grants: z.array(z.enum(GRANTS)).default([]),
})

const patchSchema = z
	.object({
		password: z.string().min(8).max(128).optional(),
		role: z.enum(ROLES).optional(),
		grants: z.array(z.enum(GRANTS)).optional(),
	})
	.refine(patch => Object.keys(patch).length > 0, { message: 'Empty patch' })

export default async function (app: FastifyInstance, { log }: Options) {
	// User management is admin-only and never grantable
	const adminOnly = { onRequest: requireAuth('admin') }

	app.get('/api/users', adminOnly, async () => {
		return { users: userStore.list(), roles: ROLES, grants: GRANTS }
	})

	app.post('/api/users', adminOnly, async (req, reply) => {
		const parsed = createSchema.safeParse(req.body)
		if (!parsed.success) {
			reply.status(400)
			return { error: parsed.error.issues }
		}

		try {
			const { name, password, role, grants } = parsed.data
			const user = userStore.create(name, password, role, grants)
			log.info(`User '${name}' (${role}) created by '${req.auth!.name}'`)
			return { user }
		} catch (error) {
			if (error instanceof UserStoreError) {
				reply.status(409)
				return { error: error.message }
			}
			throw error
		}
	})

	app.patch<{ Params: { name: string } }>(
		'/api/users/:name',
		adminOnly,
		async (req, reply) => {
			const parsed = patchSchema.safeParse(req.body)
			if (!parsed.success) {
				reply.status(400)
				return { error: parsed.error.issues }
			}

			try {
				const user = userStore.update(req.params.name, parsed.data)
				log.info(`User '${req.params.name}' updated by '${req.auth!.name}'`)
				return { user }
			} catch (error) {
				if (error instanceof UserStoreError) {
					reply.status(400)
					return { error: error.message }
				}
				throw error
			}
		}
	)

	app.delete<{ Params: { name: string } }>(
		'/api/users/:name',
		adminOnly,
		async (req, reply) => {
			if (req.params.name === req.auth!.name) {
				reply.status(400)
				return { error: 'You cannot delete your own account' }
			}

			try {
				userStore.remove(req.params.name)
				log.info(`User '${req.params.name}' deleted by '${req.auth!.name}'`)
				return { success: true }
			} catch (error) {
				if (error instanceof UserStoreError) {
					reply.status(400)
					return { error: error.message }
				}
				throw error
			}
		}
	)
}
