import { Static, Type } from '@sinclair/typebox'
import getConfig from 'paranoid-config'

const { Object, String, Integer, Array, Optional, Record, Boolean } = Type

const schema = Object(
	{
		host: Optional(String()),
		port: Integer({ minimum: 0 }),
		rtp: Object({
			host: Optional(String()),
			port: Integer({ minimum: 0 }),
			audio: Object({
				sampleRate: Integer({ minimum: 0 }),
				format: String(),
			}),
			allowedIps: Array(String(), {
				minItems: 1,
			}),
			noDataDisconnectDelay: Optional(Integer()),
		}),
		streams: Array(
			Object({
				encoder: Object({
					format: String(),
					bitrate: Optional(Integer({ minimum: 1 })),
					channels: Optional(Integer({ minimum: 1 })),
					codec: Optional(String()),
					sampleRate: Optional(Integer({ minimum: 1 })),
					options: Optional(Array(String())),
				}),
				contentType: Optional(String()),
				paths: Array(String({ minLength: 2 })),
				burstSize: Optional(Integer({ minimum: 512 })),
				headers: Optional(Record(String(), String())),
			}),
			{ minItems: 1 }
		),
		station: Optional(
			Object({
				name: Optional(String()),
				description: Optional(String()),
				genre: Optional(String()),
				public: Optional(Boolean()),
			})
		),
		globalHeaders: Optional(Record(String(), String())),
		logLevel: Optional(String()),
	},
	{ additionalProperties: false }
)

export default await getConfig<Static<typeof schema>>(schema)
