import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createVertexTtsProvider } from './vertex.js';

function silentMp3(frames: number): Buffer {
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const body = Buffer.alloc(413, 0);
  const frame = Buffer.concat([header, body]);
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

function makeMockFetch(audioBase64: string, calls: { body: string; url: string }[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    calls.push({ url, body: String(init?.body ?? '') });
    return new Response(JSON.stringify({ audioContent: audioBase64 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('createVertexTtsProvider', () => {
  it('POSTs to Google Cloud TTS with API key and decodes base64 audio', async () => {
    const calls: { body: string; url: string }[] = [];
    const audio = silentMp3(38);
    const fetchImpl = makeMockFetch(audio.toString('base64'), calls);
    const provider = createVertexTtsProvider(
      { apiKey: 'test-key' },
      { fetchImpl },
    );
    const result = await provider.synthesize({
      text: 'Bonjour',
      language: 'fr',
      voice: 'french-pro-female',
    });
    assert.equal(result.mimeType, 'audio/mpeg');
    assert.ok(result.durationSec > 0.9 && result.durationSec < 1.1);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /texttospeech\.googleapis\.com/);
    assert.match(calls[0]!.url, /key=test-key/);
    const parsed = JSON.parse(calls[0]!.body) as {
      voice: { languageCode: string; name: string };
      audioConfig: { audioEncoding: string };
    };
    assert.equal(parsed.voice.languageCode, 'fr-FR');
    assert.equal(parsed.voice.name, 'fr-FR-Neural2-A');
    assert.equal(parsed.audioConfig.audioEncoding, 'MP3');
  });

  it('reports missing API key lazily', async () => {
    const prev = process.env['ADA_VERTEX_API_KEY'];
    delete process.env['ADA_VERTEX_API_KEY'];
    try {
      const provider = createVertexTtsProvider({});
      await assert.rejects(
        () => provider.synthesize({ text: 'x', language: 'fr', voice: 'french-pro-male' }),
        /ADA_VERTEX_API_KEY manquant/,
      );
    } finally {
      if (prev !== undefined) process.env['ADA_VERTEX_API_KEY'] = prev;
    }
  });

  it('throws ModuleError on HTTP error', async () => {
    const fetchImpl = (async () =>
      new Response('Bad Request', { status: 400 })) as unknown as typeof fetch;
    const provider = createVertexTtsProvider({ apiKey: 'k' }, { fetchImpl });
    await assert.rejects(
      () => provider.synthesize({ text: 'x', language: 'fr', voice: 'french-pro-male' }),
      /HTTP 400/,
    );
  });
});
