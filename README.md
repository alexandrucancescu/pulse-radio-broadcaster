# Pulse Radio Broadcaster

Online radio broadcasting server that encodes RTP PCM 
data server-side into any formats including 
AAC, MP3, Opus, and more. 
It features customisable streaming points, 
burst buffering for seamless listening, 
and comprehensive statistics, making it a 
highly configurable solution.

Data can be streamed from hardware IP encoders
that support RTP like:
- Sonifex PS-SEND
- Barix Extreamer
- Deva DB91-TX / DB9009-TX

## To Do:

- Handle RTP not receiving data 
- Better RTP sequence numbers handling 
- Sensible defaults config 
- Better OGG header handling 
- Add stats grouped by parameters


## Roadmap:

- Comprehensive statistics:
  - Listener location statistic
  - Average listeners by hour/day of week/month
  - Average listener session
- Better OGG support with Vorbis and FLAC
- PCM audio equalizer
- Running in clusters for high listeners count

#### Warning
Ogg container is experimental (Vorbis, Opus, Flac)