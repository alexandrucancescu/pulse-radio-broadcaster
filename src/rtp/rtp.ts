const FIXED_HEADER_LENGTH = 12

export type RtpPacket = {
	version: number
	padding: number
	extension: number
	csrcCount: number
	marker: number
	payloadType: number
	sequenceNumber: number
	timestamp: number
	ssrc: number
	csrc: number[]
	payload: Buffer
}

export default function parseRtpPacket(buffer: Buffer): RtpPacket {
	if (!Buffer.isBuffer(buffer)) {
		throw new Error('buffer required')
	}

	if (buffer.length < FIXED_HEADER_LENGTH) {
		throw new Error('can not parse buffer smaller than fixed header')
	}
	const firstByte = buffer.readUInt8(0)
	const secondByte = buffer.readUInt8(1)
	const version = firstByte >> 6
	const padding = (firstByte >> 5) & 1
	const extension = (firstByte >> 4) & 1
	const csrcCount = firstByte & 0x0f
	const marker = secondByte >> 7
	const payloadType = secondByte & 0x7f
	const sequenceNumber = buffer.readUInt16BE(2)
	const timestamp = buffer.readUInt32BE(4)
	const ssrc = buffer.readUInt32BE(8)

	let offset = FIXED_HEADER_LENGTH
	let end = buffer.length
	if (end - offset < 4 * csrcCount) {
		throw new Error('no enough space for csrc')
	}
	offset += 4 * csrcCount
	if (extension) {
		if (end - offset < 4) {
			throw new Error('no enough space for extension header')
		}
		const extLen = 4 * buffer.readUInt16BE(offset + 2)
		offset += 4
		if (end - offset < extLen) {
			throw new Error('no enough space for extension data')
		}
		offset += extLen
	}
	if (padding) {
		if (end - offset < 1) {
			throw new Error('no enough space for padding header')
		}
		const paddingBytes = buffer.readUInt8(end - 1)
		if (end - offset < paddingBytes) {
			throw new Error('no enough space for padding data')
		}
		end -= paddingBytes
	}
	const parsed = {
		version: version,
		padding: padding,
		extension: extension,
		csrcCount: csrcCount,
		marker: marker,
		payloadType: payloadType,
		sequenceNumber: sequenceNumber,
		timestamp: timestamp,
		ssrc: ssrc,
		csrc: <number[]>[],
		payload: buffer.subarray(offset, end),
	}
	for (let i = 0; i < parsed.csrcCount; i++) {
		parsed.csrc.push(buffer.readUInt32BE(9 + 4 * i))
	}
	return parsed
}
