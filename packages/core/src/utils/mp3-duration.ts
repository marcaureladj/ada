// Minimal MP3 duration estimator. Parses MPEG audio frame headers and sums
// frame durations. Supports MPEG 1/2/2.5 layer III (the format ElevenLabs
// returns) and skips ID3v2 tags. No external dependency.
//
// References:
//  - MPEG audio frame header: http://www.mp3-tech.org/programmer/frame_header.html
//  - ID3v2: https://id3.org/id3v2.4.0-structure

const BITRATE_TABLE: Record<string, (number | null)[]> = {
  // [version][layer]
  '1-1': [null, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, null],
  '1-2': [null, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, null],
  '1-3': [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null],
  '2-1': [null, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, null],
  '2-2': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
  '2-3': [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, null],
};

const SAMPLE_RATE_TABLE: Record<number, [number, number, number]> = {
  // [v1, v2, v25]
  0: [44_100, 22_050, 11_025],
  1: [48_000, 24_000, 12_000],
  2: [32_000, 16_000, 8_000],
};

function skipId3v2(buf: Buffer): number {
  if (buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0;
  const size =
    ((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f);
  return 10 + size;
}

export function mp3Duration(buffer: Buffer): number {
  let offset = skipId3v2(buffer);
  let duration = 0;

  while (offset + 4 <= buffer.length) {
    const b1 = buffer[offset]!;
    const b2 = buffer[offset + 1]!;
    const b3 = buffer[offset + 2]!;

    // Frame sync: 11 bits set
    if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const versionBits = (b2 >> 3) & 0x03;
    const layerBits = (b2 >> 1) & 0x03;
    const bitrateBits = (b3 >> 4) & 0x0f;
    const sampleRateBits = (b3 >> 2) & 0x03;
    const padding = (b3 >> 1) & 0x01;

    if (versionBits === 1 || layerBits === 0) {
      offset += 1;
      continue;
    }

    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
    const layer = 4 - layerBits;
    const bitrateRow = BITRATE_TABLE[`${version === 1 ? 1 : 2}-${layer}`];
    if (!bitrateRow) {
      offset += 1;
      continue;
    }
    const bitrate = bitrateRow[bitrateBits];
    const sampleRateCol = SAMPLE_RATE_TABLE[sampleRateBits];
    if (!bitrate || !sampleRateCol) {
      offset += 1;
      continue;
    }
    const sampleRate = sampleRateCol[version === 1 ? 0 : version === 2 ? 1 : 2];

    const samplesPerFrame = layer === 1 ? 384 : version === 1 ? 1152 : 576;
    const frameLength =
      layer === 1
        ? Math.floor(((12 * bitrate * 1000) / sampleRate + padding) * 4)
        : Math.floor((samplesPerFrame / 8) * (bitrate * 1000)) / sampleRate + padding;

    duration += samplesPerFrame / sampleRate;
    offset += Math.max(1, Math.floor(frameLength));
  }

  return duration;
}
