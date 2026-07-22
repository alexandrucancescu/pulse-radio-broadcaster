# Pulse Radio Broadcaster

Online radio broadcasting server that receives PCM audio over RTP and
encodes it server-side into multiple HTTP streams (MP3, AAC, Opus, and
more) that browsers and media players can listen to directly.

Features:

- Any number of output streams from a single RTP input, each with its
  own format, bitrate, and paths
- Burst buffering — new listeners get instant audio instead of waiting
  for the next keyframe of data
- RTP jitter buffer — out-of-order packets arriving over the public
  internet are reordered before encoding (RFC 3550 style, SSRC-aware
  source restart detection)
- Public landing page listing all streams, with `.m3u` / `.pls`
  playlists for VLC, Winamp, foobar2000, etc.
- Stats dashboard (listeners, unique IPs, countries, referers, stream
  uptime and interruptions) protected by basic auth
- Icecast-style Icy headers for station metadata

Audio can be sent from hardware IP encoders that support RTP, like:

- Sonifex PS-SEND
- Barix Extreamer
- Deva DB91-TX / DB9009-TX

or from anything that can produce an RTP PCM stream (see
[Sending audio with ffmpeg](#sending-audio-with-ffmpeg)).

## Requirements

- **Node.js >= 21**
- **pnpm** (`corepack enable` or `npm i -g pnpm`)
- **ffmpeg** on the PATH, built with the codecs your streams use
  (`libmp3lame` for mp3, `libfdk_aac` or built-in `aac` for AAC,
  `libopus` for Opus)

## Setup

```bash
git clone https://github.com/alexandrucancescu/pulse-radio-broadcaster.git
cd pulse-radio-broadcaster
pnpm install
cp .env.example .env   # then edit .env
```

All configuration is done through environment variables (locally via
the `.env` file, on a PaaS like Coolify via its env var UI).

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | HTTP bind address |
| `PORT` | `3000` | HTTP port (streams, UI, stats) |
| `RTP_HOST` | `0.0.0.0` | UDP bind address for RTP |
| `RTP_PORT` | `3100` | UDP port the encoder sends RTP to |
| `RTP_SAMPLE_RATE` | `44100` | Sample rate of the incoming PCM |
| `RTP_FORMAT` | `s16be` | Sample format of the incoming PCM |
| `RTP_ALLOWED_IPS` | *(empty)* | Comma-separated IPs / CIDR ranges allowed to send RTP, e.g. `82.77.1.5,192.168.0.0/16`. Empty rejects all senders (RTP input effectively off) |
| `RTP_NO_DATA_DISCONNECT_DELAY` | `60` | Seconds of RTP silence before encoders stop and listeners are disconnected |
| `RTP_REORDER_DEPTH` | `40` | Jitter buffer depth in packets (~320ms at 44.1kHz stereo PCM) |
| `STREAMS` | one 192kbps MP3 at `/stream` | JSON array of output streams, see below |
| `STATION_NAME` | `Radio Station` | Station name (Icy headers + public page) |
| `STATION_DESCRIPTION` | `N/A` | Station description |
| `STATION_GENRE` | `N/A` | Station genre |
| `STATION_PUBLIC` | `true` | Icy `public` flag |
| `GLOBAL_HEADERS` | CORS + no-cache | JSON object of HTTP headers added to every stream response |
| `LOG_LEVEL` | `info` | `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` |
| `STATS_USERNAME` | — | Username for `/stats` and the dashboard |
| `STATS_PASSWORD` | — | Password (min 8 chars). Stats are disabled unless both are set |

### The STREAMS variable

`STREAMS` is a JSON array; each object defines one output stream:

```json
[
  { "format": "mp3",  "paths": ["/stream", "/stream.mp3"], "bitrate": 192 },
  { "format": "adts", "paths": ["/stream.aac"], "bitrate": 256 },
  { "format": "opus", "paths": ["/stream.opus"], "sampleRate": 48000 }
]
```

| Field | Required | Description |
|---|---|---|
| `format` | yes | `mp3`, `adts` (AAC), `opus`, … any ffmpeg output format |
| `paths` | yes | HTTP paths that serve this stream |
| `bitrate` | no | Output bitrate in kbps |
| `channels` | no | Output channels (default 2) |
| `codec` | no | Override the ffmpeg codec (e.g. `libmp3lame`) |
| `sampleRate` | no | Output sample rate (Opus requires 48000) |
| `options` | no | Extra ffmpeg output args, e.g. `["-frame_duration", "40"]` |
| `contentType` | no | Override the `Content-Type` response header |
| `burstSize` | no | Burst buffer size in bytes (default ~6 seconds of audio) |
| `headers` | no | Extra HTTP headers for this stream only |

In `.env` wrap the JSON in single quotes on one line:

```bash
STREAMS='[{"format":"mp3","paths":["/stream.mp3"],"bitrate":192}]'
```

## Running

```bash
pnpm dev            # run from source with auto-reload (tsx + node --watch)
pnpm build          # compile server + build the web UI into dist/
pnpm start          # run the compiled build (expects env vars to be set)
```

The web UI is served by the same HTTP server:

- `/` — public page listing all streams with live status and playlist
  downloads
- `/dashboard` — stats dashboard (basic auth with `STATS_USERNAME` /
  `STATS_PASSWORD`)

### HTTP endpoints

| Path | Description |
|---|---|
| *(your stream paths)* | The audio streams defined in `STREAMS` |
| `/api/streams` | Public JSON: station info + stream status |
| `/listen.m3u` | M3U playlist pointing at the MP3 stream (classic internet-radio standard) |
| `/listen.pls` | PLS playlist listing all streams |
| `/stats` | Full stats JSON (basic auth) |

## Docker / Coolify

A multi-stage `Dockerfile` is included. The image contains ffmpeg and
runs the compiled server.

```bash
docker build -t pulse-radio .
docker run --env-file .env -p 3000:3000 -p 3100:3100/udp pulse-radio
```

Notes for Coolify (or any proxy-fronted PaaS):

- The HTTP port is proxied normally, but **RTP is UDP** — map
  `RTP_PORT` as a UDP port directly on the host (Coolify: *Ports
  Mappings*, e.g. `3100:3100/udp`). It cannot go through the HTTP
  proxy.
- Set `STREAMS` as a single-line JSON value. If your platform escapes
  quotes (`\"`), the server detects and unescapes this automatically.

## Sending audio with ffmpeg

Any RTP PCM source works. To test with a local file:

```bash
ffmpeg -re -i song.mp3 -ar 44100 -ac 2 -acodec pcm_s16be -f rtp rtp://your-server:3100
```

Match `-ar` to `RTP_SAMPLE_RATE` and `pcm_s16be` to `RTP_FORMAT`, and
make sure the sending machine's IP is in `RTP_ALLOWED_IPS`.

## To Do

- [x] Handle RTP not receiving data
- [x] Better RTP sequence number handling (jitter buffer, SSRC restart detection)
- [x] Sensible defaults config
- [x] Statistics dashboard
- [ ] Better OGG header handling
- [ ] GitHub action for compiled releases/package

## Roadmap

- More statistics: average listeners by hour/day, average session length
- Better OGG support with Vorbis and FLAC
- PCM audio equalizer
- Running in clusters for high listener counts
- HLS streaming support

#### Warning

Ogg container support is experimental (Vorbis, Opus, Flac).

---

Developed by [Alexandru Căncescu](https://github.com/alexandrucancescu)
