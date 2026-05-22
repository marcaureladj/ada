import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createReplicateTtsProvider } from './replicate.js';

function silentMp3(frames: number): Buffer {
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const body = Buffer.alloc(413, 0);
  const frame = Buffer.concat([header, body]);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

// Helper builds a sequence of mock responses returned in order.
function sequencedFetch(responses: Array<() => Response | Promise<Response>>): typeof fetch {
  let i = 0;
  return (async () => {
    const fn = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return fn();
  }) as unknown as typeof fetch;
}

describe('createReplicateTtsProvider', () => {
  it('creates a prediction, polls until succeeded, fetches audio', async () => {
    const audio = silentMp3(38);
    const fetchImpl = sequencedFetch([
      () =>
        new Response(
          JSON.stringify({
            id: 'pred-1',
            status: 'starting',
            urls: { get: 'https://api.replicate.com/v1/predictions/pred-1' },
          }),
          { status: 201 },
        ),
      () =>
        new Response(
          JSON.stringify({ id: 'pred-1', status: 'processing' }),
          { status: 200 },
        ),
      () =>
        new Response(
          JSON.stringify({
            id: 'pred-1',
            status: 'succeeded',
            output: 'https://storage.replicate.com/audio.mp3',
          }),
          { status: 200 },
        ),
      () => {
        const u8 = new Uint8Array(audio);
        return new Response(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      },
    ]);
    const provider = createReplicateTtsProvider(
      { apiKey: 'r8_test' },
      { fetchImpl, sleep: async () => undefined },
    );
    const result = await provider.synthesize({
      text: 'Hello',
      language: 'en',
      voice: 'default',
    });
    assert.equal(result.mimeType, 'audio/mpeg');
    assert.ok(result.durationSec > 0.9 && result.durationSec < 1.1);
  });

  it('throws when prediction status is failed', async () => {
    const fetchImpl = sequencedFetch([
      () =>
        new Response(
          JSON.stringify({
            id: 'pred-1',
            status: 'starting',
            urls: { get: 'https://api.replicate.com/v1/predictions/pred-1' },
          }),
          { status: 201 },
        ),
      () =>
        new Response(
          JSON.stringify({
            id: 'pred-1',
            status: 'failed',
            error: 'model crashed',
          }),
          { status: 200 },
        ),
    ]);
    const provider = createReplicateTtsProvider(
      { apiKey: 'r8_test' },
      { fetchImpl, sleep: async () => undefined },
    );
    await assert.rejects(
      () => provider.synthesize({ text: 'x', language: 'en', voice: 'default' }),
      /prediction failed/,
    );
  });

  it('reports missing API key lazily', async () => {
    const prev = process.env['ADA_REPLICATE_API_KEY'];
    delete process.env['ADA_REPLICATE_API_KEY'];
    try {
      const provider = createReplicateTtsProvider({});
      await assert.rejects(
        () => provider.synthesize({ text: 'x', language: 'en', voice: 'default' }),
        /ADA_REPLICATE_API_KEY manquant/,
      );
    } finally {
      if (prev !== undefined) process.env['ADA_REPLICATE_API_KEY'] = prev;
    }
  });
});
