// Main-thread registry mapping listener id → unsent-bytes gauge.
// Listener metadata lives in the stats worker but sockets live here, so
// /stats (also main thread) merges the two by id at poll time. Reads are
// plain property lookups on live response objects — no sampling, no RPC.

const gauges = new Map<number, () => number>()

export function registerBufferGauge(id: number, gauge: () => number) {
	gauges.set(id, gauge)
}

export function unregisterBufferGauge(id: number) {
	gauges.delete(id)
}

export function readBufferGauge(id: number): number | undefined {
	return gauges.get(id)?.()
}
