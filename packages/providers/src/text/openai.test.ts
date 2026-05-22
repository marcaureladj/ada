import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createOpenAiTextProvider, type OpenAiClientLike } from './openai.js';

interface CapturedCall {
  // We capture the params the provider passes to the SDK so we can assert
  // on model, messages, response_format, etc.
  params: Record<string, unknown>;
}

function mockClient(reply: string): { client: OpenAiClientLike; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const client: OpenAiClientLike = {
    chat: {
      completions: {
        async create(params) {
          calls.push({ params: params as unknown as Record<string, unknown> });
          return {
            id: 'mock-id',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: reply, refusal: null },
                logprobs: null,
              },
            ],
            created: Date.now(),
            model: 'gpt-4o',
            object: 'chat.completion',
          } as never;
        },
      },
    },
  };
  return { client, calls };
}

describe('createOpenAiTextProvider', () => {
  it('passes system + user messages to the SDK', async () => {
    const { client, calls } = mockClient('hello back');
    const provider = createOpenAiTextProvider({ apiKey: 'sk-test' }, { client });
    const out = await provider.complete({ system: 'You are helpful.', prompt: 'Say hi' });
    assert.equal(out, 'hello back');
    assert.equal(calls.length, 1);
    const messages = calls[0]!.params['messages'] as Array<{ role: string; content: string }>;
    assert.equal(messages[0]?.role, 'system');
    assert.equal(messages[0]?.content, 'You are helpful.');
    assert.equal(messages[1]?.role, 'user');
    assert.equal(messages[1]?.content, 'Say hi');
  });

  it('uses response_format json_object for structured outputs', async () => {
    const { client, calls } = mockClient('{"name":"alice","age":30}');
    const provider = createOpenAiTextProvider({ apiKey: 'sk-test' }, { client });
    const schema = z.object({ name: z.string(), age: z.number() });
    const data = await provider.completeStructured({ prompt: 'Give me a person', schema });
    assert.equal(data.name, 'alice');
    assert.equal(data.age, 30);
    const fmt = calls[0]!.params['response_format'] as { type?: string } | undefined;
    assert.equal(fmt?.type, 'json_object');
  });

  it('retries with feedback on bad JSON, then throws after exhaustion', async () => {
    let nthCall = 0;
    const replies = ['not json', 'still not json'];
    const client: OpenAiClientLike = {
      chat: {
        completions: {
          async create() {
            const reply = replies[nthCall++] ?? 'fallback';
            return {
              id: 'mock',
              choices: [
                {
                  index: 0,
                  finish_reason: 'stop',
                  message: { role: 'assistant', content: reply, refusal: null },
                  logprobs: null,
                },
              ],
              created: Date.now(),
              model: 'gpt-4o',
              object: 'chat.completion',
            } as never;
          },
        },
      },
    };
    const provider = createOpenAiTextProvider({ apiKey: 'sk-test' }, { client });
    const schema = z.object({ x: z.string() });
    await assert.rejects(
      () => provider.completeStructured({ prompt: 'go', schema }),
      /completeStructured a échoué/,
    );
    assert.equal(nthCall, 2);
  });

  it('respects ADA_OPENAI_MODEL override', async () => {
    const prev = process.env['ADA_OPENAI_MODEL'];
    process.env['ADA_OPENAI_MODEL'] = 'gpt-4o-mini';
    try {
      const { client, calls } = mockClient('ok');
      const provider = createOpenAiTextProvider({ apiKey: 'sk-test' }, { client });
      await provider.complete({ prompt: 'hi' });
      assert.equal(calls[0]!.params['model'], 'gpt-4o-mini');
    } finally {
      if (prev === undefined) delete process.env['ADA_OPENAI_MODEL'];
      else process.env['ADA_OPENAI_MODEL'] = prev;
    }
  });

  it('reports missing OPENAI_API_KEY lazily', async () => {
    const prev = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    try {
      // Construction should NOT throw (lazy).
      const provider = createOpenAiTextProvider({});
      await assert.rejects(
        () => provider.complete({ prompt: 'hi' }),
        /Clé API manquante pour openai/,
      );
    } finally {
      if (prev !== undefined) process.env['OPENAI_API_KEY'] = prev;
    }
  });
});
