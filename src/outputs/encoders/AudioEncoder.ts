import { PassThrough } from 'stream'
import Ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg'
import type { Logger } from 'pino'
import EventEmitter from 'node:events'
import type { ChildProcess } from 'node:child_process'
import reaper from '../../system/PatientReaper.js'

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
	private readonly desc?: { role: string; label: string }
	private reaperId: number | null = null

	public readonly outputFormat: OutputFormat

	constructor(
		inputFormat: InputFormat,
		outputFormat: OutputFormat,
		log: Logger,
		desc?: { role: string; label: string }
	) {
		super()
		this.log = log
		this.outputFormat = outputFormat
		this.inputFormat = inputFormat
		this.desc = desc
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
			.on('start', cmd => {
				this.log.info(`Encoder start: ${cmd}`)
				// ffmpegProc is assigned by the time 'start' fires. Hand the child
				// to the reaper — its 'exit' event authoritatively marks the death,
				// including after the auto-restart below spawns a fresh process.
				const child = (this.ffmpeg as unknown as { ffmpegProc?: ChildProcess }).ffmpegProc
				if (child) {
					this.reaperId = reaper.register({
						role: this.desc?.role ?? 'encoder',
						label: this.desc?.label ?? this.outputFormat.format,
						child,
					})
				}
			})
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

	public stop() {
		//todo make sure ended; add timeout
		if (!this.isRunning) return
		// We SIGINT and move on without awaiting exit — so tell the reaper this
		// one is released. If ffmpeg ignores the signal and lingers, the reaper
		// surfaces it as 'hanging' instead of it vanishing from view.
		if (this.reaperId !== null) reaper.release(this.reaperId)
		this.reaperId = null
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

	public get bitRateBytes(): number {
		return this.bitRate * 125
	}

	public get format(): string {
		return this.outputFormat.format
	}
}

export default AudioEncoder
