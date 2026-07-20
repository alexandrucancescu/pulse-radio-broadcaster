import type StreamConnections from './StreamConnections.js'
import { Logger } from 'pino'

// Second layer of the memory policy. STREAM_MAX_BUFFER_SECONDS caps what a
// single stalled listener may buffer (individual fairness); this budget caps
// the SUM across all listeners (host safety) — at high listener counts the
// per-listener allowance alone permits multiple GB in the worst case.
// When over budget, the most-buffered listeners are kicked first: they are
// the most stalled and getting the worst experience anyway.

const SWEEP_INTERVAL_MS = 5_000
// Kick down to this fraction of the budget, not just below it, so the
// sweep doesn't fire again on the very next interval (hysteresis)
const LOW_WATER_RATIO = 0.8

/** One sweep; exported separately for tests. Returns number of kicks. */
export function sweepBufferBudget(
	connections: StreamConnections,
	budgetBytes: number,
	log: Logger
): number {
	const total = connections.totalBuffered()
	if (total <= budgetBytes) return 0

	const target = budgetBytes * LOW_WATER_RATIO
	let remaining = total
	let kicked = 0

	for (const { conn, buffered } of connections.entriesByBufferedDesc()) {
		if (remaining <= target) break

		log.warn(
			`Buffer budget exceeded (${total} bytes): kicking listener on ${conn.streamPath} (${buffered} bytes buffered)`
		)
		// kick() destroys the response → 'close' → normal cleanup removes it
		conn.kick()
		remaining -= buffered
		kicked++
	}

	return kicked
}

export function startBufferBudget(
	connections: StreamConnections,
	budgetBytes: number,
	log: Logger
) {
	if (budgetBytes <= 0) return

	log.info(`Buffer budget active: ${Math.round(budgetBytes / 1048576)} MB total`)

	const timer = setInterval(
		() => sweepBufferBudget(connections, budgetBytes, log),
		SWEEP_INTERVAL_MS
	)
	timer.unref()
}
