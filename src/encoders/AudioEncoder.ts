import { PassThrough } from 'stream'
import Ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg'
import type { Logger } from 'pino'
import EventEmitter from 'node:events'

export type InputFormat = {
	channels?: number
	format: string
	sampleRate: number
	options?: string[]
}

export type OutputFormat = {
	channels?: number
	format: string
	sampleRate?: number
	codec?: string
	options?: string[]
	quality?: string
	bitrate?: number
}

declare interface AudioEncoder {
	on(event: 'data', handler: (chunk: Buffer) => void): this
	on(event: 'restart', handler: () => void): this
}

class AudioEncoder extends EventEmitter {
	private ffmpeg: FfmpegCommand
	private inputStream: PassThrough
	private outputStream: PassThrough
	private _isRunning: boolean

	private readonly inputFormat: InputFormat
	private readonly log: Logger

	public readonly outputFormat: OutputFormat

	constructor(inputFormat: InputFormat, outputFormat: OutputFormat, log: Logger) {
		super()
		this.log = log
		this.outputFormat = outputFormat
		this.inputFormat = inputFormat
		this._isRunning = false
	}

	private createFfmpegCommand() {
		this.inputStream = new PassThrough()

		const inputOptions = ['-ac', this.inputFormat.channels?.toString() ?? '2']

		const outputOptions = ['-ac', this.inputFormat.channels?.toString() ?? '2']

		if (this.inputFormat.sampleRate) {
			inputOptions.push('-ar', this.inputFormat.sampleRate.toString())
		}

		if (this.outputFormat.bitrate) {
			outputOptions.push('-b:a', `${this.outputFormat.bitrate}k`)
		}

		if (this.outputFormat.sampleRate) {
			outputOptions.push('-ar', this.outputFormat.sampleRate?.toString())
		}

		if (this.outputFormat.codec) {
			outputOptions.push('-c:a', this.outputFormat.codec)
		}

		if (this.inputFormat.options) {
			inputOptions.push(...this.inputFormat.options)
		}

		if (this.outputFormat.options) {
			outputOptions.push(...this.outputFormat.options)
		}

		return Ffmpeg(this.inputStream, {})
			.inputFormat(this.inputFormat.format)
			.inputOptions(inputOptions)
			.outputFormat(this.outputFormat.format)
			.outputOptions(outputOptions)
	}

	public start() {
		if (this._isRunning) {
			this.log.warn('Tried to start already running encoder')
			return
		}
		this.outputStream = new PassThrough()

		this.outputStream.on('data', chunk => this.emit('data', chunk))

		this.ffmpeg = this.createFfmpegCommand()
			.on('start', cmd => this.log.info(`Encoder start: ${cmd}`))
			.on('error', err => {
				this.log.error(err, 'FFMPEG encoder error')
			})
			.on('end', () => {
				this.ffmpeg.removeAllListeners()
				this._isRunning = false
				this.emit('restart')
				this.start()
			})

		this._isRunning = true

		this.ffmpeg.pipe(this.outputStream)
	}

	public end() {}

	public stop() {
		if (!this.isRunning) return
		this.ffmpeg.removeAllListeners()
		this.ffmpeg.kill('SIGINT')
		this._isRunning = false
	}

	public write(data: Buffer) {
		if (!this.isRunning) return
		this.inputStream.write(data)
	}

	public get isRunning(): boolean {
		return this._isRunning
	}

	public get bitRate(): number {
		return this.outputFormat.bitrate ?? 128
	}

	public get format(): string {
		return this.outputFormat.format
	}
}

export default AudioEncoder
