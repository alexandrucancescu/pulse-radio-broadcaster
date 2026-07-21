import env from '../env.js'
import { config } from '../config/ConfigStore.js'
import type { MountConfig } from '../outputs/icecast/IcecastOutput.js'
import AudioFormat from '../outputs/encoders/AudioFormat.js'

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
	// A live stream is not seekable; stops clients attempting ranged requests
	'Accept-Ranges': 'none',
}

export function compileHeadersForStream(streamConfig: MountConfig, icy = false) {
	const enc = streamConfig.encoder
	const station = config().station

	const icyStationHeaders: Record<string, string> = {
		'Icy-Genre': station.genre,
		'Icy-Name': station.name,
		'Icy-Description': station.description,
		'Icy-Pub': station.public ? '1' : '0',
	}
	// Omit rather than lie when the bitrate isn't configured (e.g. VBR)
	if (enc.bitrate) icyStationHeaders['Icy-Br'] = String(enc.bitrate)
	if (station.url) icyStationHeaders['Icy-Url'] = station.url

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
		// NB: icy-metaint itself is added per-request by the StreamHandler
		// so it can never drift from the injector's live config value.
		delete headers['transfer-encoding']
		headers['connection'] = 'close'
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
