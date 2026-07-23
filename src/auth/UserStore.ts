import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import env from '../env.js'
import log from '../util/log.js'

// ── Storage ──────────────────────────────────────────────────────────
// Users live in their own file, deliberately NOT a config.json section:
// config gets pasted into support chats, copied between instances and
// restored from golden copies — password hashes must never ride along.

const DATA_DIR = resolve(process.cwd(), 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')

const BCRYPT_ROUNDS = 11

export const ROLES = ['admin', 'staff'] as const
export type Role = (typeof ROLES)[number]

// Staff grants — additive write permissions on top of read-everything.
// config/restart/users are admin-only by design, never grantable.
export const GRANTS = ['dsp', 'autodj', 'branding'] as const
export type Grant = (typeof GRANTS)[number]

const userSchema = z.object({
	name: z.string().min(1).max(64),
	hash: z.string().min(1),
	role: z.enum(ROLES),
	grants: z.array(z.enum(GRANTS)).default([]),
	// Bumped on password change / "log out everywhere" — tokens carrying
	// an older version are rejected, giving revocation without sessions
	tokenVersion: z.number().int().min(0).default(0),
})

const usersFileSchema = z.object({
	version: z.number().int().default(1),
	users: z.array(userSchema),
})

export type User = z.infer<typeof userSchema>

/** The shape safe to send to the UI — everything except the hash */
export type PublicUser = Omit<User, 'hash'>

export function toPublicUser({ hash: _hash, ...user }: User): PublicUser {
	return user
}

/**
 * All users of this instance, held in memory and persisted to
 * data/users.json with the same atomic-write pattern as ConfigStore.
 * First boot seeds one admin from the STATS_USERNAME/PASSWORD env pair;
 * after that the file wins and env credentials are ignored.
 */
class UserStore {
	private users: User[] = []

	public load() {
		if (existsSync(USERS_FILE)) {
			const parsed = usersFileSchema.parse(
				JSON.parse(readFileSync(USERS_FILE, 'utf-8'))
			)
			this.users = parsed.users
			log.info(`Loaded ${this.users.length} user(s) from ${USERS_FILE}`)
			return
		}

		if (env.STATS_USERNAME && env.STATS_PASSWORD) {
			this.users = [
				{
					name: env.STATS_USERNAME,
					hash: bcrypt.hashSync(env.STATS_PASSWORD, BCRYPT_ROUNDS),
					role: 'admin',
					grants: [],
					tokenVersion: 0,
				},
			]
			this.persist()
			log.info(`Seeded admin user '${env.STATS_USERNAME}' from env`)
		} else {
			log.warn(
				'No users file and no STATS_USERNAME/STATS_PASSWORD env — admin panel unusable until credentials are provided'
			)
		}
	}

	public find(name: string): User | undefined {
		return this.users.find(user => user.name === name)
	}

	public list(): PublicUser[] {
		return this.users.map(toPublicUser)
	}

	/** Verify credentials; returns the user on success, null otherwise */
	public verify(name: string, password: string): User | null {
		const user = this.find(name)
		// Compare against a dummy hash when the user doesn't exist so both
		// paths take bcrypt-time — no username enumeration via timing
		const hash = user?.hash ?? DUMMY_HASH
		const ok = bcrypt.compareSync(password, hash)
		return ok && user ? user : null
	}

	public create(name: string, password: string, role: Role, grants: Grant[]): PublicUser {
		if (this.find(name)) throw new UserStoreError(`User '${name}' already exists`)

		const user: User = {
			name,
			hash: bcrypt.hashSync(password, BCRYPT_ROUNDS),
			role,
			grants: role === 'admin' ? [] : grants,
			tokenVersion: 0,
		}

		this.users.push(user)
		this.persist()
		return toPublicUser(user)
	}

	public update(
		name: string,
		patch: { password?: string; role?: Role; grants?: Grant[] }
	): PublicUser {
		const user = this.find(name)
		if (!user) throw new UserStoreError(`User '${name}' not found`)

		if (patch.role && patch.role !== 'admin' && user.role === 'admin') {
			this.assertNotLastAdmin(name, 'demote')
		}

		if (patch.role) user.role = patch.role
		if (patch.grants) user.grants = patch.grants
		if (user.role === 'admin') user.grants = []

		if (patch.password) {
			user.hash = bcrypt.hashSync(patch.password, BCRYPT_ROUNDS)
			// Old tokens die with the old password
			user.tokenVersion++
		}

		this.persist()
		return toPublicUser(user)
	}

	public remove(name: string) {
		const user = this.find(name)
		if (!user) throw new UserStoreError(`User '${name}' not found`)
		if (user.role === 'admin') this.assertNotLastAdmin(name, 'delete')

		this.users = this.users.filter(u => u.name !== name)
		this.persist()
	}

	private assertNotLastAdmin(name: string, action: string) {
		const admins = this.users.filter(user => user.role === 'admin')
		if (admins.length === 1 && admins[0].name === name) {
			throw new UserStoreError(`Cannot ${action} the last admin`)
		}
	}

	private persist() {
		mkdirSync(DATA_DIR, { recursive: true })
		const tmp = `${USERS_FILE}.tmp`
		writeFileSync(
			tmp,
			JSON.stringify({ version: 1, users: this.users }, null, '\t'),
			{ mode: 0o600 }
		)
		renameSync(tmp, USERS_FILE)
	}
}

/** Errors that are the caller's fault — routes map these to 4xx */
export class UserStoreError extends Error {}

const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_ROUNDS)

const userStore = new UserStore()
userStore.load()

export default userStore
