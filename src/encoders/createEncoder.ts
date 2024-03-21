import AudioEncoder, { InputFormat, OutputFormat } from './AudioEncoder.js'
import Ffmpeg from 'fluent-ffmpeg'
import { promisify } from 'util'
import { Logger } from 'pino'
import AudioFormat from './AudioFormat.js'

const availableEncoders = await promisify(Ffmpeg.getAvailableEncoders)()

const defaultFormatEncoderOptions: Record<
	AudioFormat,
	{ format: string; codecs: string[]; options: string[] } | undefined
> = {
	[AudioFormat.MP3]: {
		format: 'mp3',
		codecs: ['libmp3lame'],
		options: [],
	},
	[AudioFormat.ADTS]: {
		format: 'adts',
		codecs: ['libfdk_aac', 'aac'],
		options: ['-profile:a', 'aac_low'],
	},
	[AudioFormat.AAC]: {
		format: 'adts',
		codecs: ['libfdk_aac', 'aac'],
		options: ['-profile:a', 'aac_low'],
	},
	[AudioFormat.AAC_HE]: {
		format: 'adts',
		codecs: ['libfdk_aac'],
		options: ['-profile:a', 'aac_he'],
	},
	[AudioFormat.AAC_HE_V2]: {
		format: 'adts',
		codecs: ['libfdk_aac'],
		options: ['-profile:a', 'aac_he_v2'],
	},
	[AudioFormat.OPUS]: {
		format: 'ogg',
		codecs: ['libopus', 'opus'],
		options: [],
	},
}

export default function createEncoder(
	inputFormat: InputFormat,
	outputFormat: OutputFormat,
	log: Logger
): AudioEncoder {
	const defaultConfig = defaultFormatEncoderOptions[<AudioFormat>outputFormat.format]

	const format = defaultConfig?.format ?? outputFormat.format

	let codec: string | undefined

	//User wants specific codec
	if (outputFormat.codec) {
		//Specified codec is not installed
		if (!(outputFormat.codec in availableEncoders))
			throw new Error(
				`Codec '${outputFormat.codec}' not supported by current ffmpeg installation`
			)

		codec = outputFormat.codec
	} else if (defaultConfig) {
		codec = defaultConfig.codecs.find(codec => codec in availableEncoders)

		if (!codec)
			throw new Error(
				`Format '${outputFormat.format}' requires one of codecs: '${defaultConfig.codecs.join(', ')}' which are not supported by current ffmpeg installation`
			)
	}

	return new AudioEncoder(
		inputFormat,
		{
			format: format,
			codec,
			bitrate: outputFormat.bitrate,
			channels: outputFormat.channels ?? 2,
			sampleRate: outputFormat.sampleRate,
			options: outputFormat.options ?? defaultConfig?.options,
		},
		log
	)
}
