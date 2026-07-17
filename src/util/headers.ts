import env from '../env.js'
import type { MountConfig } from '../stream/StreamMount.js'
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

export function compileHeadersForStream(streamConfig: MountConfig, icy = false) {
	const enc = streamConfig.encoder

	const icyStationHeaders: Record<string, string> = {
		'Icy-Genre': env.STATION_GENRE,
		'Icy-Name': env.STATION_NAME,
		'Icy-Description': env.STATION_DESCRIPTION,
		'Icy-Pub': env.STATION_PUBLIC ? '1' : '0',
	}
	// Omit rather than lie when the bitrate isn't configured (e.g. VBR)
	if (enc.bitrate) icyStationHeaders['Icy-Br'] = String(enc.bitrate)
	if (env.STATION_URL) icyStationHeaders['Icy-Url'] = env.STATION_URL

	const audioInfo = [
		enc.sampleRate && `ice-samplerate=${enc.sampleRate}`,
		enc.bitrate && `ice-bitrate=${enc.bitrate}`,
		enc.channels && `ice-channels=${enc.channels}`,
	]
		.filter(Boolean)
		.join(';')
	if (audioInfo) icyStationHeaders['ice-audio-info'] = audioInfo

	const headers = mergeHeaders(
		defaultStreamHeaders,
		{
			'Content-Type':
				formatEncodingTypeMap[<AudioFormat>enc.format] ?? streamConfig.contentType,
		},
		icyStationHeaders,
		env.GLOBAL_HEADERS,
		streamConfig.headers
	)

	if (icy) {
		// Icecast never chunk-frames stream bodies — ICY clients may count
		// metaint offsets on the raw stream, so chunked framing would
		// misalign every metadata strip. Identity body, close on end.
		delete headers['transfer-encoding']
		headers['connection'] = 'close'
		headers['icy-metaint'] = String(env.ICY_METAINT)
	}

	return headers
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
