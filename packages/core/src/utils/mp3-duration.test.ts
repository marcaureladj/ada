import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mp3Duration } from './mp3-duration.js';

function silentMp3(frameCount: number): Buffer {
  // MPEG-1 Layer 3, 128 kbps, 44.1 kHz, mono, no padding.
  // Per spec: frame size = floor(144 * 128000 / 44100) = 417 bytes.
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const body = Buffer.alloc(413, 0);
  const frame = Buffer.concat([header, body]);
  return Buffer.concat(Array.from({ length: frameCount }, () => frame));
}

describe('mp3Duration', () => {
  it('returns 0 for empty buffer', () => {
    assert.equal(mp3Duration(Buffer.alloc(0)), 0);
  });

  it('returns 0 for buffer without MPEG sync', () => {
    assert.equal(mp3Duration(Buffer.from('not an mp3 file')), 0);
  });

  it('estimates ~1 s for 38 silent frames', () => {
    // 38 * 1152 / 44100 ≈ 0.993 s
    const duration = mp3Duration(silentMp3(38));
    assert.ok(duration > 0.9 && duration < 1.05, `got ${duration}`);
  });

  it('estimates ~5 s for 192 silent frames', () => {
    // 192 * 1152 / 44100 ≈ 5.016 s
    const duration = mp3Duration(silentMp3(192));
    assert.ok(duration > 4.9 && duration < 5.2, `got ${duration}`);
  });

  it('skips ID3v2 tag and parses subsequent frames', () => {
    const id3 = Buffer.from([
      0x49,
      0x44,
      0x33, // "ID3"
      0x03,
      0x00, // version
      0x00, // flags
      0x00,
      0x00,
      0x00,
      0x0a, // synchsafe size = 10 → 10 bytes of "tag payload"
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
    ]);
    const buffer = Buffer.concat([id3, silentMp3(38)]);
    const duration = mp3Duration(buffer);
    assert.ok(duration > 0.9 && duration < 1.05, `got ${duration}`);
  });
});
