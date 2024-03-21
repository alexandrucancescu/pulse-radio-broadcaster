import config from '../config.js'
import { StreamConfig } from '../stream/StreamMount.js'
import AudioFormat from '../encoders/AudioFormat.js'

const formatEncodingTypeMap: Record<AudioFormat, string> = {
	[AudioFormat.MP3]: 'audio/mpeg',
	[AudioFormat.AAC]: 'audio/aac',
	[AudioFormat.AAC_HE]: 'audio/aac',
	[AudioFormat.AAC_HE_V2]: 'audio/aac',
	[AudioFormat.ADTS]: 'audio/aac',
	[AudioFormat.OPUS]: 'audio/ogg',
}

const defaultStreamHeaders = {
	'Transfer-Encoding': 'chunked',
	'Cache-Control': 'no-store, no-cache, must-revalidate',
	Connection: 'keep-alive',
	Pragma: 'no-cache',
	Expires: 'Wed, 19 Dec 1980 02:47:29 GMT',
}

export function compileHeadersForStream(streamConfig: StreamConfig) {
	return mergeHeaders(
		defaultStreamHeaders,
		{
			'Content-Type':
				formatEncodingTypeMap[<AudioFormat>streamConfig.encoder.format] ??
				streamConfig.contentType,
			'Icy-Br': streamConfig.encoder.bitrate?.toString() ?? '128',
			'Icy-Genre': config.station?.genre ?? 'N/A',
			'Icy-Name': config.station?.name ?? 'N/A',
			'Icy-Description': config.station?.description ?? 'N/A',
			'Icy-Pub': config.station?.public === false ? '0' : '1',
		},
		config.globalHeaders,
		streamConfig.headers
	)
}

export function mergeHeaders(
	...headersObjects: (Record<string, string> | undefined)[]
): Record<string, string> {
	const mergedHeaders: Record<string, string> = {}

	headersObjects
		.filter(obj => obj !== undefined)
		.forEach(headers => {
			Object.keys(headers!).forEach(header => {
				mergedHeaders[header.toLowerCase()] = headers![header]
			})
		})

	return mergedHeaders
}
