import * as process from 'node:process'
import { pino } from 'pino'
import env from '../env.js'

const isProduction = process.env.NODE_ENV === 'production'

export default pino({
	level: env.LOG_LEVEL,
	transport: isProduction
		? undefined
		: {
				target: 'pino-pretty',
				options: {
					translateTime: 'HH:MM:ss Z',
					ignore: 'pid,hostname',
				},
			},
})
