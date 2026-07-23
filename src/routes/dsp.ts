import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type DspChain from '../dsp/DspChain.js'
import { monitorToken } from '../util/auth.js'
import { requireAuth } from '../plugins/auth.js'
import { Logger } from 'pino'

type Options = {
	// The on-air chain — only ever changed by an explicit commit
	dspChain: DspChain
	// The tuning chain heard on /monitor.wav — where edits land first
	previewDsp: DspChain
	log: Logger
}

const bandSchema = z.object({
	type: z.enum(['peaking', 'lowshelf', 'highshelf']),
	frequency: z.number().min(20).max(20000),
	gainDb: z.number().min(-24).max(24),
	q: z.number().min(0.05).max(20),
})

const eqPatchSchema = z
	.object({
		enabled: z.boolean().optional(),
		preampDb: z.number().min(-24).max(24).optional(),
		bands: z.array(bandSchema).max(16).optional(),
	})
	.strict()

const dynamicsPatchSchema = z
	.object({
		enabled: z.boolean().optional(),
		preset: z.enum(['clean', 'warm', 'punchy', 'loud']).optional(),
		targetLufs: z.number().min(-36).max(-6).optional(),
		drive: z.number().min(-10).max(10).optional(),
		ceilingDb: z.number().min(-6).max(0).optional(),
	})
	.strict()

export default async function (app: FastifyInstance, { dspChain, previewDsp, log }: Options) {
	// Reads: any authenticated user. Writes: the 'dsp' domain (admin, or
	// staff holding the dsp grant).
	const canRead = { onRequest: requireAuth() }
	const canTune = { onRequest: requireAuth('dsp') }

	app.get('/api/dsp', canRead, async () => {
		return {
			live: dspChain.getSettings(),
			preview: previewDsp.getSettings(),
			monitorToken: monitorToken(),
		}
	})

	// Edits land on the preview chain (heard on /monitor.wav) only
	app.patch('/api/dsp/eq', canTune, async (req, reply) => {
		const parsed = eqPatchSchema.safeParse(req.body)

		if (!parsed.success) {
			reply.status(400)
			return { error: parsed.error.issues }
		}

		return previewDsp.updateEq(parsed.data)
	})

	app.patch('/api/dsp/dynamics', canTune, async (req, reply) => {
		const parsed = dynamicsPatchSchema.safeParse(req.body)

		if (!parsed.success) {
			reply.status(400)
			return { error: parsed.error.issues }
		}

		return previewDsp.updateDynamics(parsed.data)
	})

	// Put the previewed settings on air (persists via the live chain)
	app.post('/api/dsp/commit', canTune, async req => {
		const committed = dspChain.setSettings(previewDsp.getSettings())
		log.info(`DSP settings committed to live by '${req.auth!.name}'`)
		return { live: committed, preview: previewDsp.getSettings() }
	})

	// Discard preview edits, back to what's on air
	app.post('/api/dsp/reset', canTune, async () => {
		const preview = previewDsp.setSettings(dspChain.getSettings())
		return { live: dspChain.getSettings(), preview }
	})
}
