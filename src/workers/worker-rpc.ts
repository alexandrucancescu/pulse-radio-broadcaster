import { parentPort, Worker, isMainThread } from 'node:worker_threads'

type WorkerResultMessage = {
	requestId: number
	result?: unknown
	error?: any
}

type WorkerRpcMessage<T> = {
	method: keyof T
	args: any[]
	requestId: number
}

type PromiseHandler = {
	resolve: (result: unknown) => void
	reject: (error: any) => void
}

export function createWorkerProxy<T>(script: string): T {
	const worker = new Worker(script)

	let currentRequestId = 0

	let requestsMap = new Map<number, PromiseHandler>()

	worker.on('message', ({ requestId, result, error }: WorkerResultMessage) => {
		// log.trace({ requestId, result, error }, 'Received from worker')

		const handlers = requestsMap.get(requestId)

		if (handlers) {
			if (error) {
				handlers.reject(error)
			} else {
				handlers.resolve(result)
			}

			requestsMap.delete(requestId)
		}
	})

	return <T>new Proxy(
		{},
		{
			get:
				(_, method: string) =>
				(...args: unknown[]) => {
					return new Promise((resolve, reject) => {
						const requestId = currentRequestId++

						requestsMap.set(requestId, { resolve, reject })

						worker.postMessage(<WorkerRpcMessage<T>>{
							requestId,
							method,
							args,
						})
					})
				},
		}
	)
}

export function initializeRpcMethods<T>(workerObject: T) {
	if (isMainThread)
		throw new Error('initializeRpcMethods should only be called from worker threads')
	parentPort!.on('message', ({ method, args, requestId }: WorkerRpcMessage<T>) => {
		// log.trace({ method, args, requestId, }, 'Received from main thread')

		const func = workerObject[method]

		if (typeof func !== 'function') return

		Promise.resolve(func.bind(workerObject)(...args))
			.then(result => {
				parentPort!.postMessage({ requestId, result })
			})
			.catch(error => {
				parentPort!.postMessage({ requestId, error })
			})
	})
}
