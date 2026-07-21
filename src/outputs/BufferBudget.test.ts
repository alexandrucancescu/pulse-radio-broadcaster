import { describe, it, expect, vi } from 'vitest'
import StreamConnections from './StreamConnections.js'
import { sweepBufferBudget } from './BufferBudget.js'
import type { Logger } from 'pino'

const log = { warn: vi.fn(), info: vi.fn() } as unknown as Logger

function addConn(connections: StreamConnections, buffered: number) {
	const kick = vi.fn()
	const handle = connections.add({
		ip: '10.0.0.1',
		streamPath: '/stream.mp3',
		buffered: () => buffered,
		kick,
	})
	// A real kick destroys the response, whose close handler removes the
	// connection — mirror that so the sweep's math matches production
	kick.mockImplementation(() => handle.remove())
	return kick
}

describe('sweepBufferBudget', () => {
	it('does nothing while under budget', () => {
		const connections = new StreamConnections()
		addConn(connections, 400)
		addConn(connections, 500)

		expect(sweepBufferBudget(connections, 1000, log)).toBe(0)
	})

	it('kicks the most-buffered listeners first, down to the low-water mark', () => {
		const connections = new StreamConnections()
		const small = addConn(connections, 100)
		const medium = addConn(connections, 300)
		const large = addConn(connections, 700)

		// total 1100 > budget 1000; target = 800 → kicking 700 reaches 400
		expect(sweepBufferBudget(connections, 1000, log)).toBe(1)
		expect(large).toHaveBeenCalledOnce()
		expect(medium).not.toHaveBeenCalled()
		expect(small).not.toHaveBeenCalled()
	})

	it('keeps kicking until below the low-water mark', () => {
		const connections = new StreamConnections()
		const kicks = [600, 500, 400, 100].map(b => addConn(connections, b))

		// total 1600 > budget 1000; target 800 → kick 600 (1000), kick 500 (500)
		expect(sweepBufferBudget(connections, 1000, log)).toBe(2)
		expect(kicks[0]).toHaveBeenCalledOnce()
		expect(kicks[1]).toHaveBeenCalledOnce()
		expect(kicks[2]).not.toHaveBeenCalled()
		expect(connections.totalBuffered()).toBe(500)
	})
})
