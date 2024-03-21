import * as process from 'node:process'
import pino from 'pino'
import config from '../config.js'

const isProduction = process.env.NODE_ENV === 'production'

export default pino({
	level: config.logLevel ?? process.env.LOG_LEVEL ?? 'debug',
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
