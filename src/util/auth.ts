import { createHmac } from 'node:crypto'
import { authSecret } from '../auth/secret.js'

/**
 * Access token for /monitor.wav — audio players can't do cookies, so the
 * monitor accepts this as a query param. Derived from the per-instance
 * auth secret: safe to display in the UI (one-way), stable across
 * restarts, and rotates together with a secret reset.
 */
export function monitorToken(): string {
	return createHmac('sha256', authSecret())
		.update('pulse-monitor')
		.digest('hex')
		.slice(0, 32)
}
