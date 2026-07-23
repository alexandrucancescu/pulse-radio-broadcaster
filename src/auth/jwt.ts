import { jwtVerify, SignJWT } from 'jose'
import { authSecret } from './secret.js'

export const TOKEN_TTL_DAYS = 7

export type TokenPayload = {
	/** Username */
	sub: string
	/** The user's tokenVersion at signing time */
	tv: number
}

export async function signToken(payload: TokenPayload): Promise<string> {
	return new SignJWT({ tv: payload.tv })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(payload.sub)
		.setIssuedAt()
		.setExpirationTime(`${TOKEN_TTL_DAYS}d`)
		.sign(authSecret())
}

/** Returns the payload for a valid, unexpired token; null otherwise */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
	try {
		const { payload } = await jwtVerify(token, authSecret(), {
			algorithms: ['HS256'],
		})

		if (typeof payload.sub !== 'string' || typeof payload.tv !== 'number') {
			return null
		}

		return { sub: payload.sub, tv: payload.tv }
	} catch {
		// Bad signature, expired, malformed — all just "not logged in"
		return null
	}
}
