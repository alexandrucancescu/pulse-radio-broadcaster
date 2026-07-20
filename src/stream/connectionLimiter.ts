// Main-thread live count of stream connections per IP, used to enforce
// MAX_CONNECTIONS_PER_IP synchronously at request time. Kept separate from
// the stats worker's bookkeeping: enforcement can't await an RPC round-trip,
// and rejected connections must never reach the stats at all.

const counts = new Map<string, number>()

/** Returns false when the IP is at the limit; otherwise counts the connection. */
export function tryAcquireConnection(ip: string, max: number): boolean {
	const current = counts.get(ip) ?? 0

	if (max > 0 && current >= max) return false

	counts.set(ip, current + 1)
	return true
}

export function releaseConnection(ip: string) {
	const current = (counts.get(ip) ?? 1) - 1

	if (current <= 0) {
		counts.delete(ip)
	} else {
		counts.set(ip, current)
	}
}
