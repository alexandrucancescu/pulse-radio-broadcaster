import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import log from '../util/log.js'

const DATA_DIR = resolve(process.cwd(), 'data')
const SECRET_FILE = join(DATA_DIR, 'auth.secret')

// Per-instance random signing key, generated once and persisted on the
// data volume so sessions survive redeploys. Deleting the file has
// exactly one meaning: every login everywhere becomes invalid.
let secret: Buffer | null = null

export function authSecret(): Buffer {
	if (secret) return secret

	if (existsSync(SECRET_FILE)) {
		secret = Buffer.from(readFileSync(SECRET_FILE, 'utf-8').trim(), 'base64')
	} else {
		const fresh = randomBytes(32)
		mkdirSync(DATA_DIR, { recursive: true })
		writeFileSync(SECRET_FILE, fresh.toString('base64') + '\n', { mode: 0o600 })
		secret = fresh
		log.info('Generated new auth signing secret')
	}

	return secret
}
