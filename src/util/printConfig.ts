import * as process from 'process'

const print = async () => {
	const index = process.argv.indexOf('--appInstance')

	if (index !== -1) {
		const appInstanceName = process.argv[index + 1]

		if (!appInstanceName) throw new Error('No app instance name was provided')

		console.log('APP instance set via --appInstance to :', appInstanceName)

		process.env.NODE_APP_INSTANCE = appInstanceName
	}

	let npmAppInstance = process.env.npm_config_appinstance

	if (npmAppInstance) {
		console.log(`APP INSTANCE = ${npmAppInstance}`)

		process.env.NODE_APP_INSTANCE = npmAppInstance
	}

	const config = await import('../config.js')
	console.log('Config: ')
	console.dir(config, { depth: null })
}

print()
