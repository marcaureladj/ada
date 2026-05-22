import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiTtsProvider, type OpenAiTtsClientLike } from './openai.js';

function silentMp3(frames: number): Buffer {
  // Same generator pattern as the mock TTS provider for predictability.
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const body = Buffer.alloc(413, 0);
  const frame = Buffer.concat([header, body]);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

interface CapturedCall {
  params: Record<string, unknown>;
}

function mockClient(audioBytes: Buffer): { client: OpenAiTtsClientLike; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  return {
    calls,
    client: {
      audio: {
        speech: {
          async create(params) {
            calls.push({ params: params as unknown as Record<string, unknown> });
            const u8 = new Uint8Array(audioBytes);
            const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
            return {
              async arrayBuffer() {
                return ab;
              },
            };
          },
        },
      },
    },
  };
}

describe('createOpenAiTtsProvider', () => {
  it('synthesizes and returns a Buffer + duration via mp3Duration', async () => {
    const { client, calls } = mockClient(silentMp3(38));
    const provider = createOpenAiTtsProvider({ apiKey: 'sk-test' }, { client });
    const result = await provider.synthesize({ text: 'Bonjour', language: 'fr', voice: 'alloy' });
    assert.ok(Buffer.isBuffer(result.audio));
    assert.equal(result.mimeType, 'audio/mpeg');
    // 38 frames * 1152 / 44100 ≈ 0.99 s
    assert.ok(result.durationSec > 0.9 && result.durationSec < 1.1, `got ${result.durationSec}`);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.params['voice'], 'alloy');
    assert.equal(calls[0]!.params['response_format'], 'mp3');
  });

  it('resolves french-pro-male alias to onyx', async () => {
    const { client, calls } = mockClient(silentMp3(10));
    const provider = createOpenAiTtsProvider({ apiKey: 'sk-test' }, { client });
    await provider.synthesize({ text: 'salut', language: 'fr', voice: 'french-pro-male' });
    assert.equal(calls[0]!.params['voice'], 'onyx');
  });

  it('falls back to alloy for an unknown voice', async () => {
    const { client, calls } = mockClient(silentMp3(10));
    const provider = createOpenAiTtsProvider({ apiKey: 'sk-test' }, { client });
    await provider.synthesize({ text: 'hi', language: 'en', voice: 'invented-voice-xyz' });
    assert.equal(calls[0]!.params['voice'], 'alloy');
  });

  it('reports missing OPENAI_API_KEY lazily', async () => {
    const prev = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    try {
      const provider = createOpenAiTtsProvider({});
      await assert.rejects(
        () => provider.synthesize({ text: 'hi', language: 'en', voice: 'alloy' }),
        /OPENAI_API_KEY manquant/,
      );
    } finally {
      if (prev !== undefined) process.env['OPENAI_API_KEY'] = prev;
    }
  });
});
