import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  countRetriesByProvider,
  createCompositeEventSink,
  createFileEventSink,
  createMemoryEventSink,
  type AdaEvent,
} from './events.js';
import { createWorkdir } from './workdir.js';

async function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'ada-events-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('createMemoryEventSink', () => {
  it('accumulates emitted events with ts + runId', () => {
    const sink = createMemoryEventSink('run-xyz');
    sink.emit({ level: 'info', type: 'api.anthropic.call', payload: { tokens: 100 } });
    sink.emit({ level: 'warn', type: 'api.anthropic.retry', payload: { attempt: 1 } });
    assert.equal(sink.events.length, 2);
    assert.equal(sink.events[0]!.runId, 'run-xyz');
    assert.equal(sink.events[0]!.type, 'api.anthropic.call');
    assert.match(sink.events[0]!.ts, /^\d{4}-/);
  });
});

describe('createFileEventSink', () => {
  it('writes one JSON line per event into events.ndjson', async () => {
    await withTempDir(async (baseDir) => {
      const workdir = createWorkdir(baseDir);
      const sink = createFileEventSink(workdir);
      sink.emit({ level: 'info', type: 'api.anthropic.call', payload: { ok: true } });
      sink.emit({
        level: 'info',
        type: 'playwright.action',
        sceneId: 'home',
        payload: { action: 'click' },
      });
      await sink.close();
      assert.ok(existsSync(workdir.eventsNdjson));
      const lines = readFileSync(workdir.eventsNdjson, 'utf8')
        .split('\n')
        .filter((l) => l.length > 0);
      assert.equal(lines.length, 2);
      const first = JSON.parse(lines[0]!) as AdaEvent;
      assert.equal(first.type, 'api.anthropic.call');
      assert.equal(first.runId, workdir.id);
      const second = JSON.parse(lines[1]!) as AdaEvent;
      assert.equal(second.sceneId, 'home');
    });
  });
});

describe('createCompositeEventSink', () => {
  it('fans out emits to all underlying sinks', async () => {
    const a = createMemoryEventSink('r');
    const b = createMemoryEventSink('r');
    const composite = createCompositeEventSink(a, b);
    composite.emit({ level: 'info', type: 't', payload: {} });
    composite.emit({ level: 'info', type: 'u', payload: {} });
    await composite.close();
    assert.equal(a.events.length, 2);
    assert.equal(b.events.length, 2);
  });
});

describe('countRetriesByProvider', () => {
  it('counts api.<provider>.retry events grouped by provider', () => {
    const sink = createMemoryEventSink();
    sink.emit({ level: 'warn', type: 'api.anthropic.retry', payload: {} });
    sink.emit({ level: 'warn', type: 'api.anthropic.retry', payload: {} });
    sink.emit({ level: 'warn', type: 'api.openai.retry', payload: {} });
    sink.emit({ level: 'info', type: 'api.anthropic.call', payload: {} });
    const summary = countRetriesByProvider(sink.events);
    assert.equal(summary.total, 3);
    assert.equal(summary.byProvider['anthropic'], 2);
    assert.equal(summary.byProvider['openai'], 1);
  });

  it('returns zero on empty input', () => {
    const summary = countRetriesByProvider([]);
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.byProvider, {});
  });
});
