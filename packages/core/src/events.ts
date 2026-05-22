import { appendFileSync, closeSync, openSync } from 'node:fs';
import type { Workdir } from './workdir.js';

export type EventLevel = 'debug' | 'info' | 'warn' | 'error';

export type EventStage =
  | 'planner'
  | 'navigator'
  | 'scripter'
  | 'voicer'
  | 'composer'
  | 'auth';

export interface AdaEvent {
  ts: string;
  level: EventLevel;
  runId: string;
  sceneId?: string;
  stage?: EventStage;
  type: string;
  payload: Record<string, unknown>;
}

export type EventInput = Omit<AdaEvent, 'ts' | 'runId'>;

export interface EventSink {
  emit(event: EventInput): void;
  close(): Promise<void>;
}

interface SinkOptions {
  runId: string;
}

export function createFileEventSink(workdir: Workdir): EventSink {
  // Pre-touch the file so tail -f finds it immediately.
  closeSync(openSync(workdir.eventsNdjson, 'a'));
  const options: SinkOptions = { runId: workdir.id };
  return {
    emit(event: EventInput) {
      const full: AdaEvent = {
        ts: new Date().toISOString(),
        runId: options.runId,
        ...event,
      };
      appendFileSync(workdir.eventsNdjson, `${JSON.stringify(full)}\n`, 'utf8');
    },
    async close() {
      // No buffered state to flush; file is sync-appended.
    },
  };
}

export interface MemoryEventSink extends EventSink {
  readonly events: AdaEvent[];
}

export function createMemoryEventSink(runId = 'test-run'): MemoryEventSink {
  const events: AdaEvent[] = [];
  return {
    events,
    emit(event: EventInput) {
      events.push({
        ts: new Date().toISOString(),
        runId,
        ...event,
      });
    },
    async close() {
      // No-op.
    },
  };
}

export function createCompositeEventSink(...sinks: EventSink[]): EventSink {
  return {
    emit(event: EventInput) {
      for (const sink of sinks) sink.emit(event);
    },
    async close() {
      await Promise.all(sinks.map((s) => s.close()));
    },
  };
}

export interface RelayEventSink extends EventSink {
  setDownstream(sink: EventSink | undefined): void;
}

/**
 * A sink with no downstream — emits become no-ops. Once `setDownstream(s)` is
 * called, subsequent emits forward to `s`. Used to wire providers at
 * construction time (before the pipeline workdir exists) and attach the real
 * file/memory sinks once the pipeline starts.
 */
export function createRelayEventSink(): RelayEventSink {
  let downstream: EventSink | undefined;
  return {
    emit(event: EventInput) {
      downstream?.emit(event);
    },
    async close() {
      // The relay itself doesn't own resources — closing the downstream is
      // the responsibility of whoever attached it.
    },
    setDownstream(sink) {
      downstream = sink;
    },
  };
}

// Counts retry events emitted via `api.*.retry` by provider name. Useful for
// the pipeline's RunReport summary.
export function countRetriesByProvider(
  events: ReadonlyArray<AdaEvent>,
): { total: number; byProvider: Record<string, number> } {
  const byProvider: Record<string, number> = {};
  let total = 0;
  for (const ev of events) {
    if (!ev.type.startsWith('api.') || !ev.type.endsWith('.retry')) continue;
    total += 1;
    const provider = ev.type.slice(4, -('.retry'.length));
    byProvider[provider] = (byProvider[provider] ?? 0) + 1;
  }
  return { total, byProvider };
}
