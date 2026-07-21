import { FastifyInstance } from 'fastify'
import BasicAuth from '@fastify/basic-auth'
import { z } from 'zod'
import type DspChain from '../dsp/DspChain.js'
import { statsAuthConfigured, validateStatsAuth, monitorToken } from '../util/auth.js'
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
	if (!statsAuthConfigured()) {
		log.warn('Not initializing /api/dsp as STATS_USERNAME / STATS_PASSWORD are not set')
		return
	}

	app.register(BasicAuth, {
		validate: validateStatsAuth,
		authenticate: true,
	}).after(() => {
		app.get('/api/dsp', { onRequest: app.basicAuth }, async () => {
			return {
				live: dspChain.getSettings(),
				preview: previewDsp.getSettings(),
				monitorToken: monitorToken(),
			}
		})

		// Edits land on the preview chain (heard on /monitor.wav) only
		app.patch('/api/dsp/eq', { onRequest: app.basicAuth }, async (req, reply) => {
			const parsed = eqPatchSchema.safeParse(req.body)

			if (!parsed.success) {
				reply.status(400)
				return { error: parsed.error.issues }
			}

			return previewDsp.updateEq(parsed.data)
		})

		app.patch('/api/dsp/dynamics', { onRequest: app.basicAuth }, async (req, reply) => {
			const parsed = dynamicsPatchSchema.safeParse(req.body)

			if (!parsed.success) {
				reply.status(400)
				return { error: parsed.error.issues }
			}

			return previewDsp.updateDynamics(parsed.data)
		})

		// Put the previewed settings on air (persists via the live chain)
		app.post('/api/dsp/commit', { onRequest: app.basicAuth }, async () => {
			const committed = dspChain.setSettings(previewDsp.getSettings())
			log.info('DSP settings committed to live')
			return { live: committed, preview: previewDsp.getSettings() }
		})

		// Discard preview edits, back to what's on air
		app.post('/api/dsp/reset', { onRequest: app.basicAuth }, async () => {
			const preview = previewDsp.setSettings(dspChain.getSettings())
			return { live: dspChain.getSettings(), preview }
		})
	})
}
